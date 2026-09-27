import type { Context } from 'hono';
import { DomainValidationError } from '../domain/errors';

// The largest legitimate request field is 12KB; anything past 1MB is abuse,
// so the body is streamed with a running total instead of buffered blindly.
const MAX_REQUEST_BODY_BYTES = 1_000_000;

export async function readBoundedBodyText(
  body: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (body === null) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new DomainValidationError('Request body is too large');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function requestJson(context: Context): Promise<unknown> {
  let text: string;
  try {
    text = await readBoundedBodyText(context.req.raw.body);
  } catch (error) {
    if (error instanceof DomainValidationError) throw error;
    throw new DomainValidationError('Request body must be valid JSON');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DomainValidationError('Request body must be valid JSON');
  }
}
