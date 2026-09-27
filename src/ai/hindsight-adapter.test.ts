import { afterEach, describe, expect, it, vi } from 'vitest';
import { HindsightMemoryProvider, deriveBankId, MemoryProviderFault } from './hindsight-adapter';
import type { MemoryRecallRequest, MemoryWrite } from './memory-provider';
import { OptionalMemoryProvider } from './optional-memory';

const ownerId = '550e8400-e29b-41d4-a716-446655440000';
const write: MemoryWrite = {
  documentId: 'event:7', content: 'Repair moved to testing', context: 'Operator domain event',
  timestamp: '2026-09-27T06:00:00Z',
  scope: { ownerId, tags: ['job:1', 'repair:2'] },
  source: { kind: 'domain-event', id: '7', occurredAt: '2026-09-27T06:00:00Z',
    partyId: '3', jobId: '1', taskId: '4', repairId: '2', scheduledActionId: '5' },
};
const recall: MemoryRecallRequest = {
  query: 'Why did the repair move?', maxTokens: 100,
  queryTimestamp: '2026-09-27T07:00:00Z', scope: write.scope,
};
let calls: Array<{ url: string; init: RequestInit }> = [];
let response: unknown;
let status = 200;
let failure: Error | undefined;
const fakeFetch: typeof fetch = (url, init) => {
  calls.push({ url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url, init: init ?? {} });
  if (failure !== undefined) return Promise.reject(failure);
  return Promise.resolve(new Response(JSON.stringify(response), { status }));
};
const bank = async () => deriveBankId(ownerId);
const provider = () => new HindsightMemoryProvider({ url: 'http://localhost:8888', apiKey: 'test-key', requestTimeoutMs: 200, fetchFn: fakeFetch });
const body = (): Record<string, unknown> => {
  const text = calls[0]?.init.body;
  if (typeof text !== 'string') throw new Error('Expected JSON request');
  return JSON.parse(text) as Record<string, unknown>;
};
const item = (): Record<string, unknown> => {
  const items = body()['items'];
  if (!Array.isArray(items)) throw new Error('Expected items');
  const first: unknown = items[0];
  if (typeof first !== 'object' || first === null) throw new Error('Expected item');
  return first as Record<string, unknown>;
};
const retainOk = async (): Promise<void> => { response = { success: true, bank_id: await bank(), items_count: 1, async: false }; };
afterEach(() => { calls = []; response = undefined; failure = undefined; status = 200; vi.restoreAllMocks(); });

describe('Hindsight HTTP adapter', () => {
  it('derives stable, distinct bank IDs without exposing raw owner IDs', async () => {
    expect(await deriveBankId(ownerId)).toBe(await bank());
    expect(await deriveBankId('another-owner')).not.toBe(await bank());
    expect(await bank()).toMatch(/^elara-[a-f0-9]{32}$/);
    expect(await bank()).not.toContain(ownerId);
  });
  it('maps retain to current API; replaces stable document and preserves all provenance', async () => {
    await retainOk();
    await provider().retain(write);
    expect(calls[0]?.url).toBe(`http://localhost:8888/v1/default/banks/${await bank()}/memories`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(item()).toMatchObject({ document_id: 'event:7', content: write.content,
      timestamp: write.timestamp, tags: ['job:1', 'repair:2'], update_mode: 'replace',
      metadata: { 'elara:source_kind': 'domain-event', 'elara:source_id': '7',
        'elara:source_occurred_at': write.source.occurredAt, 'elara:party_id': '3',
        'elara:job_id': '1', 'elara:task_id': '4', 'elara:repair_id': '2',
        'elara:scheduled_action_id': '5' } });
    await provider().retain({ ...write, content: 'Later stage' });
    expect(calls[1]?.url).toBe(calls[0]?.url);
    expect(item()['document_id']).toBe('event:7');
  });
  it('derives the bank from owner, never a caller-supplied bank field', async () => {
    await retainOk();
    const adversarial = { ...write, bank_id: 'other-user', scope: { ...write.scope, bank_id: 'other-user' } };
    await provider().retain(adversarial);
    expect(calls[0]?.url).toContain(await bank());
    expect(calls[0]?.url).not.toContain('other-user');
    expect(JSON.stringify(body())).not.toContain('other-user');
  });
  it('rejects secrets in content, context, tags and metadata before HTTP', async () => {
    const credential = 'ghp_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
    for (const attempt of [
      { ...write, content: credential }, { ...write, context: credential },
      { ...write, scope: { ...write.scope, tags: [credential] } },
      { ...write, source: { ...write.source, id: credential } },
    ]) {
      const error = await provider().retain(attempt).then(() => '', (e: unknown) => e instanceof Error ? e.message : 'unknown');
      expect(error).not.toContain(credential);
      expect(error).toContain('detected credentials');
    }
    expect(calls).toHaveLength(0);
  });
  it('rejects credentials in recall queries and tags before HTTP', async () => {
    const credential = 'gho_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234';
    for (const attempt of [
      { ...recall, query: credential },
      { ...recall, scope: { ownerId, tags: [credential] } },
    ]) {
      const error = await provider().recall(attempt).then(
        () => '',
        (caught: unknown) => caught instanceof Error ? caught.message : 'unknown',
      );
      expect(error).not.toContain(credential);
      expect(error).toContain('detected credentials');
    }
    expect(calls).toHaveLength(0);
  });
  it('omits authorization for an explicitly unauthenticated provider', async () => {
    await retainOk();
    const unauthenticated = new HindsightMemoryProvider({
      url: 'http://localhost:8888',
      apiKey: '',
      requestTimeoutMs: 200,
      fetchFn: fakeFetch,
    });
    await unauthenticated.retain(write);
    expect(calls[0]?.init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(calls[0]?.init.headers).not.toHaveProperty('Authorization');
  });
  it('recalls ordered results, strict tags, budget, time and observation evidence', async () => {
    response = { results: [
      { id: 'b', text: 'Second fact', type: 'world', tags: ['job:1'],
        occurred_start: '2026-09-27T06:00:00Z', mentioned_at: '2026-09-27T07:00:00Z',
        metadata: { 'elara:source_kind': 'domain-event', 'elara:source_id': '7',
          'elara:repair_id': '2' } },
      { id: 'a', text: 'Repeated issue', type: 'observation', tags: ['job:1'],
        source_fact_ids: ['fact-1'] },
    ], source_facts: { 'fact-1': { id: 'fact-1', text: 'fault found', type: 'world',
      metadata: { 'elara:source_kind': 'note', 'elara:source_id': '8', 'elara:job_id': '1' } } } };
    const result = await provider().recall(recall);
    expect(calls[0]?.url).toBe(`http://localhost:8888/v1/default/banks/${await bank()}/memories/recall`);
    expect(body()).toMatchObject({ max_tokens: 100, query_timestamp: recall.queryTimestamp,
      tags: ['job:1', 'repair:2'], tags_match: 'all_strict', include: { source_facts: { max_tokens: 100 } } });
    expect(result.hits.map((hit) => hit.id)).toEqual(['b', 'a']);
    expect(result.hits[0]).toMatchObject({ layer: 'fact', occurredAt: '2026-09-27T06:00:00Z',
      learnedAt: '2026-09-27T07:00:00Z', evidence: [{ source: { kind: 'domain-event', id: '7', repairId: '2' } }] });
    expect(result.hits[1]).toMatchObject({ layer: 'observation', evidence: [
      { source: { kind: 'note', id: '8', jobId: '1' }, quote: 'fault found' } ] });
  });
  it('omits tag filter when none requested and does not invent unsupported provenance', async () => {
    response = { results: [{ id: 'a', text: 'untagged', source_fact_ids: ['missing'] }] };
    const result = await provider().recall({ ...recall, scope: { ownerId, tags: [] } });
    expect(body()).not.toHaveProperty('tags');
    expect(result.hits[0]?.evidence).toEqual([]);
  });
  it('fails safely on malformed retain and recall success bodies', async () => {
    response = { success: true, bank_id: 'wrong', items_count: 1, async: false };
    await expect(provider().retain(write)).rejects.toMatchObject({ code: 'invalid-response' });
    response = { results: [{ id: 1, text: 'bad' }] };
    await expect(provider().recall(recall)).rejects.toMatchObject({ code: 'invalid-response' });
    response = { facts: [] };
    await expect(provider().recall(recall)).rejects.toBeInstanceOf(MemoryProviderFault);
  });
  it('never echoes private provider response content or network exceptions', async () => {
    const secret = 'sk-' + 'proj-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    response = { error: secret }; status = 502;
    await expect(provider().retain(write)).rejects.toThrow('Memory provider http (502)');
    failure = new Error(secret);
    const err = await provider().recall(recall).then(() => '', (e: unknown) => e instanceof Error ? e.message : 'unknown');
    expect(err).not.toContain(secret);
    expect(err).toContain('network');
  });
  it('aborts stalled fetch within timeout', async () => {
    const stalled: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('private content')), { once: true });
    });
    const timed = new HindsightMemoryProvider({ url: 'http://localhost:8888', apiKey: 'key', requestTimeoutMs: 15, fetchFn: stalled });
    await expect(timed.recall(recall)).rejects.toMatchObject({ code: 'timeout' });
  });
  it('degrades provider failure, reports only safe codes and leaves operations isolated', async () => {
    const report = vi.fn();
    const optional = new OptionalMemoryProvider(provider(), report);
    status = 503; response = { error: 'private memory' };
    await expect(optional.retain(write)).resolves.toBeUndefined();
    expect(await optional.recall(recall)).toEqual({ hits: [], truncated: false });
    expect(report).toHaveBeenCalledWith('retain', 'http');
    expect(report).toHaveBeenCalledWith('recall', 'http');
    expect(JSON.stringify(report.mock.calls)).not.toContain('private memory');
  });
});
