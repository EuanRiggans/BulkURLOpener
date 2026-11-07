import * as v from 'valibot';
import { digest, jsonValueSchema, stableJson, type JsonValue } from './json';
import { hashSchema } from './schema';
import { MigrationError, requireCondition } from './errors';

export const maxArchiveBytes = 64 * 1024 * 1024;
export const maxPackedBytes = 16 * 1024 * 1024;
export const maxTransportBytes = 24 * 1024 * 1024;
export const packedJsonSchema = v.strictObject({
  format: v.literal('bulk-url-opener-packed-json'),
  version: v.literal(1),
  codec: v.literal('gzip-base64'),
  digest: hashSchema,
  data: v.pipe(v.string(), v.maxLength(Math.ceil(maxPackedBytes / 3) * 4)),
});
export type PackedJson = v.InferOutput<typeof packedJsonSchema>;
export const utf8Bytes = (text: string) =>
  new TextEncoder().encode(text).byteLength;
async function bounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new MigrationError('RECOVERY_ARCHIVE_TOO_LARGE');
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
function base64(value: Uint8Array) {
  const chunks = [];
  for (let start = 0; start < value.length; start += 0x8000)
    chunks.push(String.fromCharCode(...value.subarray(start, start + 0x8000)));
  return btoa(chunks.join(''));
}
export async function packJson(raw: unknown): Promise<PackedJson> {
  const value = v.parse(jsonValueSchema, raw);
  const text = stableJson(value);
  requireCondition(
    utf8Bytes(text) <= maxArchiveBytes,
    'RECOVERY_ARCHIVE_TOO_LARGE',
  );
  const compressed = await bounded(
    new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')),
    maxPackedBytes,
  );
  return {
    format: 'bulk-url-opener-packed-json',
    version: 1,
    codec: 'gzip-base64',
    digest: await digest(value),
    data: base64(compressed),
  };
}
export async function unpackJson(raw: unknown): Promise<JsonValue> {
  const parsed = v.safeParse(packedJsonSchema, raw);
  if (!parsed.success) {
    requireCondition(
      !(
        raw &&
        typeof raw === 'object' &&
        'format' in raw &&
        raw.format === 'bulk-url-opener-packed-json'
      ),
      'RECOVERY_ARCHIVE_INVALID',
    );
    return v.parse(jsonValueSchema, raw);
  }
  try {
    const binary = atob(parsed.output.data);
    requireCondition(
      binary.length <= maxPackedBytes && btoa(binary) === parsed.output.data,
      'RECOVERY_ARCHIVE_INVALID',
    );
    const input = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const decoded = await bounded(
      new Blob([input.buffer])
        .stream()
        .pipeThrough(new DecompressionStream('gzip')),
      maxArchiveBytes,
    );
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(decoded),
    );
    const json = v.parse(jsonValueSchema, value);
    requireCondition(
      (await digest(json)) === parsed.output.digest,
      'RECOVERY_ARCHIVE_INVALID',
    );
    return json;
  } catch (reason) {
    if (reason instanceof MigrationError) throw reason;
    throw new MigrationError('RECOVERY_ARCHIVE_INVALID');
  }
}
export async function prepareImportText(text: string): Promise<string> {
  requireCondition(
    utf8Bytes(text) <= maxArchiveBytes,
    'RECOVERY_ARCHIVE_TOO_LARGE',
  );
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new MigrationError('IMPORT_INVALID');
  }
  if (v.is(packedJsonSchema, raw)) {
    await unpackJson(raw);
    return JSON.stringify(raw);
  }
  return JSON.stringify(await packJson(raw));
}
