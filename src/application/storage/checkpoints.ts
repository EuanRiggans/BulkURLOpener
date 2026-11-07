import * as v from 'valibot';
import {
  checkpointHistoryLimit,
  checkpointReceiptLimit,
  checkpointSchema,
  metadataSchema,
  type Checkpoint,
  type CheckpointReceipt,
} from '../../domain/storage/checkpoints';
import {
  backupSchema,
  dataSchema,
  listSchema,
  settingsSchema,
  stageSchema,
  stateSchema,
  type CanonicalData,
  type Head,
  type LibraryCommand,
  type MutationInput,
} from '../../domain/storage/schema';
import { digest } from '../../domain/storage/json';
import { sameContent } from '../../domain/storage/migrate';
import { requireCondition } from '../../domain/storage/errors';
import { transferRecordSchema } from '../../domain/workspace-schema';

type Store = Record<string, unknown>;
type Component = 'list' | 'settings' | 'metadata';
export const stateKey = (hash: string) => 'buo:v2:state:' + hash;
export const contentKey = (kind: Component, hash: string) =>
  'buo:v2:content:' + kind + ':' + hash;
export function isCheckpoint(
  raw: unknown,
): raw is Record<string, unknown> & { schemaVersion: 4 } {
  return (
    raw !== null &&
    typeof raw === 'object' &&
    'schemaVersion' in raw &&
    raw.schemaVersion === 4
  );
}
function checked<T>(schema: v.GenericSchema<T>, raw: unknown): T {
  const result = v.safeParse(schema, raw);
  requireCondition(result.success, 'INTEGRITY_CHECK_FAILED');
  return result.output;
}
export const recordBytes = (key: string, raw: unknown) =>
  new TextEncoder().encode(key + JSON.stringify(raw)).byteLength;

// Shared within one verification only. Unchanged list blobs and migration
// sources are hashed once even when several retained roots refer to them.
export class CheckpointReader {
  private legacy = new Map<string, CanonicalData>();
  private values = new Map<string, unknown>();
  private origins = new Set<string>();
  constructor(readonly store: Store) {}
  async origin(backupDigest: string, stageDigest: string) {
    const tag = backupDigest + stageDigest;
    if (this.origins.has(tag)) return;
    const backup = checked(
      backupSchema,
      this.store['buo:v2:backup:' + backupDigest],
    );
    requireCondition(
      backup.digest === backupDigest &&
        (await digest(backup.sources)) === backupDigest,
      'INTEGRITY_CHECK_FAILED',
    );
    const stage = checked(
      stageSchema,
      this.store['buo:v2:stage:' + stageDigest],
    );
    requireCondition(
      (await digest(stage)) === stageDigest &&
        stage.backupDigest === backupDigest,
      'INTEGRITY_CHECK_FAILED',
    );
    requireCondition(
      !Object.keys(backup.sources.storageLocal).some((key) =>
        key.startsWith('buo:v2:'),
      ),
      'INTEGRITY_CHECK_FAILED',
    );
    this.origins.add(tag);
  }
  async anchor(ref: Head): Promise<CanonicalData> {
    const cached = this.legacy.get(ref.stateDigest);
    if (cached) return cached;
    const state = checked(stateSchema, this.store[stateKey(ref.stateDigest)]);
    requireCondition(
      state.revision === ref.revision &&
        (await digest(state)) === ref.stateDigest &&
        state.data,
      'INTEGRITY_CHECK_FAILED',
    );
    await this.origin(state.backupDigest, state.stageDigest);
    this.legacy.set(ref.stateDigest, state.data);
    return state.data;
  }
  private async component<S extends v.GenericSchema>(
    kind: Component,
    hash: string,
    schema: S,
    fallback: unknown,
  ): Promise<v.InferOutput<S>> {
    const key = contentKey(kind, hash);
    if (this.values.has(key)) return this.values.get(key);
    const raw = Object.hasOwn(this.store, key) ? this.store[key] : fallback;
    const value = checked(schema, raw);
    requireCondition((await digest(value)) === hash, 'INTEGRITY_CHECK_FAILED');
    this.values.set(key, value);
    return value;
  }
  async read(ref: Head): Promise<{
    state: Checkpoint | null;
    data: CanonicalData;
    keys: Set<string>;
  }> {
    const raw = this.store[stateKey(ref.stateDigest)];
    if (!isCheckpoint(raw))
      return {
        state: null,
        data: await this.anchor(ref),
        keys: new Set([stateKey(ref.stateDigest)]),
      };
    const state = checked(checkpointSchema, raw);
    requireCondition(
      state.revision === ref.revision &&
        (await digest(state)) === ref.stateDigest,
      'INTEGRITY_CHECK_FAILED',
    );
    requireCondition(
      state.operation.expectedHead.revision + 1 === state.revision,
      'INTEGRITY_CHECK_FAILED',
    );
    requireCondition(
      state.retained.every((old) => old.revision < state.revision) &&
        new Set(state.retained.map((old) => old.stateDigest)).size ===
          state.retained.length,
      'INTEGRITY_CHECK_FAILED',
    );
    await this.origin(state.backupDigest, state.stageDigest);
    const base = state.base ? await this.anchor(state.base) : null;
    const keys = new Set([stateKey(ref.stateDigest)]);
    if (state.base) keys.add(stateKey(state.base.stateDigest));
    const lists = [];
    for (const entry of state.lists) {
      const list = await this.component(
        'list',
        entry.digest,
        listSchema,
        base?.lists.find((list) => list.id === entry.id),
      );
      requireCondition(list.id === entry.id, 'INTEGRITY_CHECK_FAILED');
      lists.push(list);
      if (Object.hasOwn(this.store, contentKey('list', entry.digest)))
        keys.add(contentKey('list', entry.digest));
    }
    const settings = await this.component(
      'settings',
      state.settings,
      settingsSchema,
      base?.settings,
    );
    const metadata = await this.component(
      'metadata',
      state.metadata,
      metadataSchema,
      base
        ? { draftLines: base.draftLines, recoveredInputs: base.recoveredInputs }
        : undefined,
    );
    for (const [kind, hash] of [
      ['settings', state.settings],
      ['metadata', state.metadata],
    ] as const)
      if (Object.hasOwn(this.store, contentKey(kind, hash)))
        keys.add(contentKey(kind, hash));
    const ids = new Set(lists.map((list) => list.id));
    requireCondition(
      ids.size === lists.length &&
        (settings.openOnLaunch === null || ids.has(settings.openOnLaunch)) &&
        (['current-tabs', 'previous-input'].includes(
          settings.defaultListOpen,
        ) ||
          ids.has(settings.defaultListOpen)),
      'INTEGRITY_CHECK_FAILED',
    );
    const data: CanonicalData = { lists, settings, ...metadata };
    const command = checkpointCommand(state, data);
    requireCondition(
      (await digest({
        expectedHead: state.operation.expectedHead,
        command,
      })) === state.operation.requestDigest,
      'INTEGRITY_CHECK_FAILED',
    );
    requireCondition(
      new Set(state.receipts.map((receipt) => receipt.id)).size ===
        state.receipts.length &&
        state.receipts.some(
          (receipt) =>
            receipt.id === state.operation.id &&
            receipt.requestDigest === state.operation.requestDigest,
        ),
      'INTEGRITY_CHECK_FAILED',
    );
    if (command.kind === 'library.replace') {
      const key = 'buo:v2:transfer:' + command.sourceDigest;
      const transfer = checked(transferRecordSchema, this.store[key]);
      requireCondition(
        (await digest(transfer)) === command.sourceDigest &&
          sameContent(transfer.baseHead, state.operation.expectedHead) &&
          transfer.source !== 'sync-upload',
        'INTEGRITY_CHECK_FAILED',
      );
      keys.add(key);
    }
    return { state, data, keys };
  }
}

export function checkpointCommand(
  state: Checkpoint,
  data: CanonicalData,
): LibraryCommand {
  const command = state.operation.command;
  if (command.kind === 'list.create' || command.kind === 'list.update') {
    const id =
      command.kind === 'list.create'
        ? 'list-' + state.operation.id
        : command.id;
    const list = data.lists.find((list) => list.id === id);
    requireCondition(
      list && list.name === command.name,
      'INTEGRITY_CHECK_FAILED',
    );
    return { ...command, lines: list.lines };
  }
  if (command.kind === 'draft.update')
    return { ...command, lines: data.draftLines };
  if (command.kind === 'library.replace')
    return { ...command, lists: data.lists, settings: data.settings };
  return command;
}
function compactCommand(
  command: LibraryCommand,
): Checkpoint['operation']['command'] {
  switch (command.kind) {
    case 'list.create':
      return { kind: command.kind, name: command.name };
    case 'list.update':
      return { kind: command.kind, id: command.id, name: command.name };
    case 'draft.update':
      return { kind: command.kind };
    case 'library.replace':
      return { kind: command.kind, sourceDigest: command.sourceDigest };
    default:
      return command;
  }
}

export async function planCheckpoint(
  store: Store,
  current: {
    head: Head;
    data: CanonicalData;
    backupDigest: string;
    stageDigest: string;
  },
  input: MutationInput,
  next: CanonicalData,
  legacyReceipts: CheckpointReceipt[] = [],
  materialize = false,
) {
  const reader = new CheckpointReader(store);
  const currentRoot = isCheckpoint(store[stateKey(current.head.stateDigest)])
    ? checked(checkpointSchema, store[stateKey(current.head.stateDigest)])
    : null;
  const base = materialize
    ? null
    : currentRoot
      ? currentRoot.base
      : current.head;
  const anchor = base ? await reader.anchor(base) : null;
  const writes: Store = {};
  async function reference<S extends v.GenericSchema>(
    kind: Component,
    schema: S,
    value: v.InferOutput<S>,
    fallback: unknown,
  ) {
    const parsed = checked(schema, value);
    const hash = await digest(parsed);
    const key = contentKey(kind, hash);
    if (Object.hasOwn(store, key))
      requireCondition(
        sameContent(parsed, checked(schema, store[key])),
        'IMMUTABLE_RECORD_CONFLICT',
      );
    else if (fallback === undefined || (await digest(fallback)) !== hash)
      writes[key] = parsed;
    return hash;
  }
  const lists = [];
  for (const list of next.lists)
    lists.push({
      id: list.id,
      digest: await reference(
        'list',
        listSchema,
        list,
        anchor?.lists.find((old) => old.id === list.id),
      ),
    });
  const settings = await reference(
    'settings',
    settingsSchema,
    next.settings,
    anchor?.settings,
  );
  const metadata = await reference(
    'metadata',
    metadataSchema,
    { draftLines: next.draftLines, recoveredInputs: next.recoveredInputs },
    anchor
      ? {
          draftLines: anchor.draftLines,
          recoveredInputs: anchor.recoveredInputs,
        }
      : undefined,
  );
  const requestDigest = await digest({
    expectedHead: input.expectedHead,
    command: input.command,
  });
  const receipts = [
    ...(currentRoot?.receipts ?? legacyReceipts).filter(
      (receipt) => receipt.id !== input.id,
    ),
    { id: input.id, requestDigest },
  ].slice(-checkpointReceiptLimit);
  const retained: Head[] = [];
  for (const old of [current.head, ...(currentRoot?.retained ?? [])]) {
    try {
      await reader.read(old);
      retained.push(old);
    } catch {
      /* A damaged old checkpoint is preserved outside automatic retention. */
    }
    if (retained.length === checkpointHistoryLimit) break;
  }
  requireCondition(retained.length > 0, 'INTEGRITY_CHECK_FAILED');
  const state: Checkpoint = {
    schemaVersion: 4,
    kind: 'checkpoint',
    revision: current.head.revision + 1,
    backupDigest: current.backupDigest,
    stageDigest: current.stageDigest,
    base,
    lists,
    settings,
    metadata,
    retained,
    receipts,
    operation: {
      id: input.id,
      expectedHead: input.expectedHead,
      requestDigest,
      command: compactCommand(input.command),
    },
  };
  const stateDigest = await digest(state);
  const head: Head = {
    schemaVersion: 1,
    revision: state.revision,
    stateDigest,
  };
  // Also validate reconstruction of a compact command before anything is written.
  requireCondition(
    sameContent(checkpointCommand(state, next), input.command),
    'INTEGRITY_CHECK_FAILED',
  );
  checked(dataSchema, next);
  return { state, head, writes };
}

export async function checkpointReachability(store: Store, head: Head) {
  const reader = new CheckpointReader(store);
  const current = await reader.read(head);
  requireCondition(current.state, 'INTEGRITY_CHECK_FAILED');
  const keys = new Set(current.keys);
  for (const old of current.state.retained) {
    try {
      for (const key of (await reader.read(old)).keys) keys.add(key);
    } catch {
      keys.add(stateKey(old.stateDigest));
      for (const key of Object.keys(store).filter((key) =>
        key.startsWith('buo:v2:content:'),
      ))
        keys.add(key);
    }
  }
  return { reader, ...current, keys };
}
