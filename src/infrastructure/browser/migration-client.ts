import * as v from 'valibot';
import { browser } from 'wxt/browser';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import { documentSchema } from '../../domain/storage/schema';
import { sameContent } from '../../domain/storage/migrate';
import type { MigrationRequest } from '../../application/storage/protocol';

export function captureDocument(
  storage: Storage = localStorage,
): Record<string, string> {
  function read() {
    const entries: [string, string][] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      requireCondition(key !== null, 'SOURCES_CHANGED');
      const value = storage.getItem(key);
      requireCondition(value !== null, 'SOURCES_CHANGED');
      entries.push([key, value]);
    }
    return v.parse(documentSchema, Object.fromEntries(entries));
  }
  const first = read();
  requireCondition(sameContent(first, read()), 'SOURCES_CHANGED');
  return first;
}

const envelope = v.variant('ok', [
  v.strictObject({ ok: v.literal(true), value: v.unknown() }),
  v.strictObject({ ok: v.literal(false), error: v.string() }),
]);

export async function migrationRequest<T>(
  request: MigrationRequest,
  schema: v.GenericSchema<T>,
): Promise<T> {
  const response = v.parse(
    envelope,
    await browser.runtime.sendMessage(request),
  );
  if (!response.ok) throw new MigrationError(response.error);
  return v.parse(schema, response.value);
}
