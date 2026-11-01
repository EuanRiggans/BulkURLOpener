import * as v from 'valibot';
import { requireCondition } from '../../domain/storage/errors';
import { documentSchema } from '../../domain/storage/schema';
import { sameContent } from '../../domain/storage/migrate';
import type { MigrationRequest } from '../../application/storage/protocol';
import { extensionRequest } from './client';

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

export async function migrationRequest<T>(
  request: MigrationRequest,
  schema: v.GenericSchema<T>,
): Promise<T> {
  return extensionRequest(request, schema);
}
