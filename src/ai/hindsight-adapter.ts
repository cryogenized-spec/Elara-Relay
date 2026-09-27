/** Private server-only HTTP adapter. Hindsight API research: vectorize-io/hindsight
 * ccfe85b4851957ac2adf88b4a9ddf9668b2882f1, TypeScript client 0.10.1. */
import { z } from 'zod';
import type {
  MemoryEvidenceRef, MemoryHit, MemoryProvider, MemoryRecallRequest,
  MemoryRecallResult, MemorySourceRef, MemoryWrite,
} from './memory-provider';
import { screenForSecrets, SecretDetectedError } from './secret-screen';

const sourceKind = z.enum(['conversation', 'domain-event', 'document', 'note']);
const metadataSchema = z.record(z.string(), z.string());
const resultSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: z.enum(['world', 'experience', 'observation']).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  metadata: metadataSchema.nullable().optional(),
  occurred_start: z.string().nullable().optional(),
  mentioned_at: z.string().nullable().optional(),
  source_fact_ids: z.array(z.string()).nullable().optional(),
}).passthrough();
const recallSchema = z.object({
  results: z.array(resultSchema),
  source_facts: z.record(z.string(), resultSchema).nullable().optional(),
  source_facts_truncated: z.boolean().nullable().optional(),
}).passthrough();
const retainSchema = z.object({
  success: z.literal(true),
  bank_id: z.string(),
  items_count: z.literal(1),
  async: z.literal(false),
}).passthrough();

export type MemoryFaultCode = 'http' | 'timeout' | 'network' | 'invalid-response';
/** Never store provider exception, response body, URL, input or credentials. */
export class MemoryProviderFault extends Error {
  public constructor(public readonly code: MemoryFaultCode, public readonly status?: number) {
    super(`Memory provider ${code}${status === undefined ? '' : ` (${status})`}`);
    this.name = 'MemoryProviderFault';
  }
}

/** The owner ID is assigned by authenticated server orchestration, not by a model. */
export async function deriveBankId(ownerId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`elara:memory-bank:${ownerId}`));
  return `elara-${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)}`;
}

export interface HindsightAdapterOptions {
  readonly url: string;
  readonly apiKey: string;
  readonly requestTimeoutMs: number;
  readonly fetchFn?: typeof fetch;
}

function sourceMetadata(write: MemoryWrite): Record<string, string> {
  const source = write.source;
  const metadata: Record<string, string> = {
    'elara:source_kind': source.kind,
    'elara:source_id': source.id,
  };
  const fields = {
    'elara:source_occurred_at': source.occurredAt,
    'elara:party_id': source.partyId,
    'elara:job_id': source.jobId,
    'elara:task_id': source.taskId,
    'elara:repair_id': source.repairId,
    'elara:scheduled_action_id': source.scheduledActionId,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) metadata[key] = value;
  }
  return metadata;
}

function sourceFromMetadata(metadata: Record<string, string> | null | undefined): MemorySourceRef | undefined {
  if (metadata === null || metadata === undefined) return undefined;
  const kind = sourceKind.safeParse(metadata['elara:source_kind']);
  const id = metadata['elara:source_id'];
  if (!kind.success || !id) return undefined;
  return {
    kind: kind.data, id,
    ...(metadata['elara:source_occurred_at'] && { occurredAt: metadata['elara:source_occurred_at'] }),
    ...(metadata['elara:party_id'] && { partyId: metadata['elara:party_id'] }),
    ...(metadata['elara:job_id'] && { jobId: metadata['elara:job_id'] }),
    ...(metadata['elara:task_id'] && { taskId: metadata['elara:task_id'] }),
    ...(metadata['elara:repair_id'] && { repairId: metadata['elara:repair_id'] }),
    ...(metadata['elara:scheduled_action_id'] && { scheduledActionId: metadata['elara:scheduled_action_id'] }),
  };
}

/** Uses Hindsight ranking directly; observation evidence is resolved through
 * the source_facts map, never invented from an opaque provider fact ID. */
function mapRecall(data: z.infer<typeof recallSchema>): MemoryRecallResult {
  const hits: MemoryHit[] = data.results.map((item): MemoryHit => {
    const evidence: MemoryEvidenceRef[] = [];
    const directSource = sourceFromMetadata(item.metadata);
    if (directSource !== undefined) evidence.push({ source: directSource });
    for (const id of item.source_fact_ids ?? []) {
      const fact = data.source_facts?.[id];
      const source = sourceFromMetadata(fact?.metadata);
      if (source !== undefined) evidence.push({ source, ...(fact?.text && { quote: fact.text }) });
    }
    return {
      id: item.id,
      content: item.text,
      layer: item.type === 'observation' ? 'observation' : 'fact',
      tags: item.tags ?? [],
      evidence,
      ...(item.occurred_start && { occurredAt: item.occurred_start }),
      ...(item.mentioned_at && { learnedAt: item.mentioned_at }),
    };
  });
  return { hits, truncated: data.source_facts_truncated === true };
}

/** Narrow native-fetch client; no MCP, reflect or provider mutation authority. */
export class HindsightMemoryProvider implements MemoryProvider {
  private readonly fetchFn: typeof fetch;
  public constructor(private readonly options: HindsightAdapterOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  public async retain(input: MemoryWrite): Promise<void> {
    // Screen every field that will be sent, not only the main content.
    const metadata = sourceMetadata(input);
    const outbound = [input.content, input.context, input.documentId, input.timestamp ?? '',
      ...input.scope.tags, ...Object.values(metadata)];
    const matches = outbound.flatMap((value) => screenForSecrets(value).matches);
    if (matches.length > 0) throw new SecretDetectedError(matches);
    const bankId = await deriveBankId(input.scope.ownerId);
    const response = await this.post(`/v1/default/banks/${encodeURIComponent(bankId)}/memories`, {
      items: [{ content: input.content, context: input.context, document_id: input.documentId,
        update_mode: 'replace', tags: [...input.scope.tags], metadata,
        ...(input.timestamp !== undefined && { timestamp: input.timestamp }) }],
      async: false,
    });
    const parsed = retainSchema.safeParse(response);
    if (!parsed.success || parsed.data.bank_id !== bankId) throw new MemoryProviderFault('invalid-response');
  }

  public async recall(input: MemoryRecallRequest): Promise<MemoryRecallResult> {
    const bankId = await deriveBankId(input.scope.ownerId);
    const response = await this.post(`/v1/default/banks/${encodeURIComponent(bankId)}/memories/recall`, {
      query: input.query, max_tokens: input.maxTokens,
      ...(input.scope.tags.length > 0 && { tags: [...input.scope.tags], tags_match: 'all_strict' }),
      ...(input.queryTimestamp !== undefined && { query_timestamp: input.queryTimestamp }),
      include: { source_facts: { max_tokens: input.maxTokens } },
    });
    const parsed = recallSchema.safeParse(response);
    if (!parsed.success) throw new MemoryProviderFault('invalid-response');
    return mapRecall(parsed.data);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const signal = AbortSignal.timeout(this.options.requestTimeoutMs);
    try {
      const response = await this.fetchFn(`${this.options.url}${path}`, {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new MemoryProviderFault('http', response.status);
      // Bound response reading; the abort signal also covers body streaming.
      const reader = response.body?.getReader();
      if (reader === undefined) throw new MemoryProviderFault('invalid-response');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) {
          await reader.cancel().catch(() => undefined);
          throw new MemoryProviderFault('invalid-response');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
      catch { throw new MemoryProviderFault('invalid-response'); }
    } catch (error: unknown) {
      if (error instanceof MemoryProviderFault) throw error;
      // Never include provider exception details: some fetch implementations
      // embed URL, headers or private response content in error messages.
      if (signal.aborted) throw new MemoryProviderFault('timeout');
      throw new MemoryProviderFault('network');
    }
  }
}
