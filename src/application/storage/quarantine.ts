import * as v from 'valibot';
import { quarantineSchema } from '../../domain/storage/quarantine';
import { checkpointSchema } from '../../domain/storage/checkpoints';
import { stateSchema } from '../../domain/storage/schema';
import { digest } from '../../domain/storage/json';
import { requireCondition } from '../../domain/storage/errors';
import { contentKey, stateKey } from './checkpoints';

type Store = Record<string, unknown>;
export async function quarantines(store: Store) {
  const results = [];
  for (const [key, raw] of Object.entries(store).filter(([key]) =>
    key.startsWith('buo:v2:quarantine:'),
  )) {
    const parsed = v.safeParse(quarantineSchema, raw);
    requireCondition(
      parsed.success &&
        (await digest(parsed.output)) ===
          key.slice('buo:v2:quarantine:'.length),
      'QUARANTINE_INTEGRITY_FAILED',
    );
    requireCondition(
      Object.hasOwn(store, stateKey(parsed.output.stateDigest)) &&
        (await digest(store[stateKey(parsed.output.stateDigest)])) ===
          parsed.output.recordDigest,
      'QUARANTINE_INTEGRITY_FAILED',
    );
    results.push(parsed.output);
  }
  return results;
}
export function quarantineReferences(store: Store, id: string) {
  const keys = new Set([stateKey(id)]);
  const root = v.safeParse(checkpointSchema, store[stateKey(id)]);
  if (root.success) {
    for (const list of root.output.lists)
      keys.add(contentKey('list', list.digest));
    keys.add(contentKey('settings', root.output.settings));
    keys.add(contentKey('metadata', root.output.metadata));
    if (root.output.base) keys.add(stateKey(root.output.base.stateDigest));
    if (root.output.operation.command.kind === 'library.replace')
      keys.add('buo:v2:transfer:' + root.output.operation.command.sourceDigest);
    return { operationId: root.output.operation.id, protectedKeys: [...keys] };
  }
  const old = v.safeParse(stateSchema, store[stateKey(id)]);
  if (old.success) {
    if (old.output.previous)
      keys.add(stateKey(old.output.previous.stateDigest));
    if (
      old.output.kind === 'mutation' &&
      old.output.operation.command.kind === 'library.replace'
    )
      keys.add('buo:v2:transfer:' + old.output.operation.command.sourceDigest);
    return {
      operationId:
        old.output.kind === 'mutation' ? old.output.operation.id : null,
      protectedKeys: [...keys],
    };
  }
  // An unreadable inactive header has no reliable reference list. Preserve all
  // existing components and transfer originals alongside the exact damaged body.
  for (const key of Object.keys(store).filter(
    (key) =>
      key.startsWith('buo:v2:state:') ||
      key.startsWith('buo:v2:content:') ||
      key.startsWith('buo:v2:transfer:'),
  ))
    keys.add(key);
  return { operationId: null, protectedKeys: [...keys] };
}
