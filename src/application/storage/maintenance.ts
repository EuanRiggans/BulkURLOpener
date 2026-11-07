import { quarantines } from './quarantine';
import * as v from 'valibot';
import {
  archiveProofSchema,
  archiveReceiptSchema,
  checkpointSchema,
} from '../../domain/storage/checkpoints';
import { digest } from '../../domain/storage/json';
import { unpackJson } from '../../domain/storage/archive';
import { portableData } from '../../domain/portable';
import {
  hashSchema,
  headSchema,
  stateSchema,
  type Head,
} from '../../domain/storage/schema';
import {
  snapshotSchema,
  transferRecordSchema,
} from '../../domain/workspace-schema';
import {
  checkpointReachability,
  CheckpointReader,
  contentKey,
  isCheckpoint,
  stateKey,
} from './checkpoints';

type Store = Record<string, unknown>;
export interface MaintenanceIO {
  read(): Promise<Store>;
  append(key: string, value: unknown): Promise<void>;
  remove(keys: string[]): Promise<void>;
  now(): string;
}
const gcSchema = v.strictObject({
  schemaVersion: v.literal(1),
  head: headSchema,
  records: v.array(v.strictObject({ key: v.string(), digest: hashSchema })),
});
const contentPattern = /^buo:v2:content:(list|settings|metadata):[a-f0-9]{64}$/;

async function disposableTransfer(raw: unknown) {
  const entry = v.safeParse(transferRecordSchema, raw);
  if (!entry.success || entry.output.schemaVersion !== 2) return false;
  try {
    // Only a pure portable lists/settings source can expire automatically.
    // Recovery/legacy originals may hold backups, damaged input or pending work
    // that the active library intentionally does not import.
    portableData(await unpackJson(entry.output.raw));
    return true;
  } catch {
    return false;
  }
}

async function protectedKeys(store: Store, head: Head) {
  const current = await checkpointReachability(store, head);
  const keys = current.keys;
  for (const entry of await quarantines(store))
    for (const key of entry.protectedKeys) keys.add(key);
  const plannedRoots = new Set<string>();
  for (const [key, raw] of Object.entries(store).filter(([key]) =>
    key.startsWith('buo:v2:gc:'),
  )) {
    const plan = v.safeParse(gcSchema, raw);
    if (
      !plan.success ||
      (await digest(plan.output)) !== key.slice('buo:v2:gc:'.length)
    )
      continue;
    for (const entry of plan.output.records)
      if (
        entry.key.startsWith('buo:v2:state:') &&
        entry.digest === entry.key.slice('buo:v2:state:'.length)
      )
        plannedRoots.add(entry.key);
  }
  const reader = new CheckpointReader(store);
  // Partial/unacknowledged saves are not garbage. Damaged roots make content
  // ownership uncertain, so retain their contents for explicit recovery.
  let uncertain = false;
  for (const [key, raw] of Object.entries(store).filter(([key]) =>
    key.startsWith('buo:v2:state:'),
  )) {
    if (!isCheckpoint(raw)) {
      const old = v.safeParse(stateSchema, raw);
      if (
        old.success &&
        old.output.kind === 'mutation' &&
        old.output.revision >= head.revision
      ) {
        keys.add(key);
        if (old.output.operation.command.kind === 'library.replace')
          keys.add(
            'buo:v2:transfer:' + old.output.operation.command.sourceDigest,
          );
      }
      continue;
    }
    const parsed = v.safeParse(checkpointSchema, raw);
    if (
      !parsed.success ||
      (await digest(raw)) !== key.slice('buo:v2:state:'.length)
    ) {
      keys.add(key);
      uncertain = true;
    } else {
      let protect =
        parsed.output.revision >= head.revision &&
        key !== stateKey(head.stateDigest);
      if (
        parsed.output.revision < head.revision &&
        !keys.has(key) &&
        !plannedRoots.has(key)
      ) {
        try {
          await reader.read({
            schemaVersion: 1,
            revision: parsed.output.revision,
            stateDigest: key.slice('buo:v2:state:'.length),
          });
        } catch {
          protect = true;
        }
      }
      if (!protect) continue;
      keys.add(key);
      for (const list of parsed.output.lists)
        keys.add(contentKey('list', list.digest));
      keys.add(contentKey('settings', parsed.output.settings));
      keys.add(contentKey('metadata', parsed.output.metadata));
      if (parsed.output.base)
        keys.add(stateKey(parsed.output.base.stateDigest));
      if (parsed.output.operation.command.kind === 'library.replace')
        keys.add(
          'buo:v2:transfer:' + parsed.output.operation.command.sourceDigest,
        );
    }
  }
  if (uncertain)
    for (const key of Object.keys(store).filter((key) =>
      contentPattern.test(key),
    ))
      keys.add(key);
  return keys;
}

export async function archiveEligible(
  key: string,
  raw: unknown,
): Promise<boolean> {
  if (/^buo:v2:state:[a-f0-9]{64}$/.test(key)) {
    const state = v.safeParse(stateSchema, raw);
    return (
      state.success &&
      state.output.kind === 'mutation' &&
      (await digest(state.output)) === key.slice('buo:v2:state:'.length)
    );
  }
  if (/^buo:v2:transfer:[a-f0-9]{64}$/.test(key)) {
    const entry = v.safeParse(transferRecordSchema, raw);
    return (
      entry.success &&
      (await digest(entry.output)) === key.slice('buo:v2:transfer:'.length)
    );
  }
  if (/^buo:v2:snapshot:[a-f0-9]{64}$/.test(key)) {
    const entry = v.safeParse(snapshotSchema, raw);
    return (
      entry.success &&
      (await digest({ head: entry.output.head, data: entry.output.data })) ===
        key.slice('buo:v2:snapshot:'.length)
    );
  }
  return false;
}
export async function finishArchiveProofs(io: MaintenanceIO, head: Head) {
  const store = await io.read();
  const protectedSet = await protectedKeys(store, head);
  for (const [key, raw] of Object.entries(store).filter(([key]) =>
    key.startsWith('buo:v2:archive-proof:'),
  )) {
    const parsed = v.safeParse(archiveProofSchema, raw);
    if (
      !parsed.success ||
      (await digest(parsed.output)) !==
        key.slice('buo:v2:archive-proof:'.length)
    )
      continue;
    let changed = false;
    for (const record of parsed.output.records)
      if (
        Object.hasOwn(store, record.key) &&
        (await digest(store[record.key])) !== record.digest
      )
        changed = true;
    if (changed) continue;
    let pending = false;
    const remove = [];
    for (const record of parsed.output.records) {
      if (!Object.hasOwn(store, record.key)) continue;
      if (
        !protectedSet.has(record.key) &&
        (await digest(store[record.key])) === record.digest &&
        (await archiveEligible(record.key, store[record.key]))
      )
        remove.push(record.key);
      else pending = true;
    }
    if (remove.length) await io.remove(remove);
    if (!pending) {
      const receipt = {
        schemaVersion: 2 as const,
        archiveDigest: parsed.output.archiveDigest,
        sourcesDigest: parsed.output.sourcesDigest,
        completedAt: io.now(),
      };
      await io.append(
        'buo:v2:archive-proof:' + (await digest(receipt)),
        receipt,
      );
      await io.remove([key]);
    }
  }
  const receipts = [];
  for (const [key, raw] of Object.entries(await io.read()).filter(([key]) =>
    key.startsWith('buo:v2:archive-proof:'),
  )) {
    const parsed = v.safeParse(archiveReceiptSchema, raw);
    if (
      parsed.success &&
      (await digest(parsed.output)) ===
        key.slice('buo:v2:archive-proof:'.length)
    )
      receipts.push({ key, at: parsed.output.completedAt });
  }
  receipts.sort(
    (a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key),
  );
  if (receipts.length > 20)
    await io.remove(receipts.slice(20).map((item) => item.key));
}

// A durable deletion manifest survives partial remove() failures. It contains
// checksums of only obsolete *new-format* records, never raw migration sources.
export async function collectCheckpoints(io: MaintenanceIO, head: Head) {
  let store = await io.read();
  let protectedSet = await protectedKeys(store, head);
  const reader = new CheckpointReader(store);
  const obsolete = new Set<string>();
  for (const [key, raw] of Object.entries(store)) {
    if (
      !key.startsWith('buo:v2:state:') ||
      protectedSet.has(key) ||
      !isCheckpoint(raw)
    )
      continue;
    const parsed = v.safeParse(checkpointSchema, raw);
    if (!parsed.success || parsed.output.revision >= head.revision) continue;
    try {
      const old = await reader.read({
        schemaVersion: 1,
        revision: parsed.output.revision,
        stateDigest: key.slice('buo:v2:state:'.length),
      });
      for (const candidate of old.keys)
        if (
          !protectedSet.has(candidate) &&
          (candidate === key ||
            contentPattern.test(candidate) ||
            (candidate.startsWith('buo:v2:transfer:') &&
              (await disposableTransfer(store[candidate]))))
        )
          obsolete.add(candidate);
    } catch {
      // Keep damaged/staged data; a previous GC plan can still complete its own
      // checksummed removals if this was an interrupted cleanup.
    }
  }
  const records = [];
  for (const key of [...obsolete].sort())
    if (Object.hasOwn(store, key))
      records.push({ key, digest: await digest(store[key]) });
  if (records.length) {
    const plan = { schemaVersion: 1 as const, head, records };
    await io.append('buo:v2:gc:' + (await digest(plan)), plan);
  }
  store = await io.read();
  protectedSet = await protectedKeys(store, head);
  for (const [key, raw] of Object.entries(store).filter(([key]) =>
    key.startsWith('buo:v2:gc:'),
  )) {
    const parsed = v.safeParse(gcSchema, raw);
    if (
      !parsed.success ||
      (await digest(parsed.output)) !== key.slice('buo:v2:gc:'.length)
    )
      continue;
    let changed = false;
    for (const record of parsed.output.records)
      if (
        Object.hasOwn(store, record.key) &&
        (await digest(store[record.key])) !== record.digest
      )
        changed = true;
    if (changed) continue;
    const removals = [];
    let remaining = false;
    for (const entry of parsed.output.records) {
      if (!Object.hasOwn(store, entry.key)) continue;
      const value = store[entry.key];
      const root = v.safeParse(checkpointSchema, value);
      const allowed =
        contentPattern.test(entry.key) ||
        (entry.key.startsWith('buo:v2:state:') &&
          root.success &&
          root.output.revision < parsed.output.head.revision) ||
        (entry.key.startsWith('buo:v2:transfer:') &&
          (await disposableTransfer(value)));
      if (
        allowed &&
        !protectedSet.has(entry.key) &&
        (await digest(value)) === entry.digest
      )
        removals.push(entry.key);
      else remaining = true;
    }
    if (removals.length) await io.remove(removals);
    if (!remaining) await io.remove([key]);
  }
}
