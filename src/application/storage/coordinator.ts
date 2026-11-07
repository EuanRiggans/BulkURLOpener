import type { HeldJobs } from '../../domain/opening/history';
import { CorruptionRecovery } from './recovery';
import {
  isRecoveryState,
  readRecoveryState,
  recoveryProtection,
} from './recovery-records';
import {
  recoveryStateSchema,
  type RecoveryState,
  type RecoverySource,
  type RecoveryApply,
} from '../../domain/storage/recovery';
import { openingEpoch } from './job-maintenance';
import { quarantines, quarantineReferences } from './quarantine';
import * as v from 'valibot';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import { digest, jsonObjectSchema } from '../../domain/storage/json';
import { applyLibraryCommand } from '../../domain/library';
import { JobJournal } from './job-journal';
import { WorkspaceStore } from './workspace-store';
import {
  archiveEligible,
  collectCheckpoints,
  finishArchiveProofs,
} from './maintenance';
import { transferRecordSchema } from '../../domain/workspace-schema';
import {
  archiveProofSchema,
  archiveReceiptSchema,
  checkpointSchema,
  checkpointHistoryLimit,
  type Checkpoint,
  type CheckpointReceipt,
} from '../../domain/storage/checkpoints';
import {
  packJson,
  unpackJson,
  type PackedJson,
} from '../../domain/storage/archive';
import { toPortable } from '../../domain/portable';
import {
  CheckpointReader,
  checkpointCommand,
  checkpointReachability,
  isCheckpoint,
  planCheckpoint,
  recordBytes,
  stateKey,
} from './checkpoints';
import {
  analyzeSources,
  createCandidate,
  sameContent,
} from '../../domain/storage/migrate';
import {
  backupSchema,
  documentSchema,
  headKey,
  headSchema,
  sourcesSchema,
  stageSchema,
  stateSchema,
  mutationInputSchema,
  recoveryExportSchema,
  storagePrefix,
  type Backup,
  type Decisions,
  type Head,
  type MigrationReview,
  type Sources,
  type Stage,
  type StorageStatus,
  type StoredState,
  type RecoveryExport,
  type MutationInput,
  type CanonicalData,
} from '../../domain/storage/schema';

export interface StoragePort {
  readLocal(): Promise<Record<string, unknown>>;
  readSync(): Promise<Record<string, unknown>>;
  writeLocal(values: Record<string, unknown>): Promise<void>;
  removeLocal?(keys: string[]): Promise<void>;
  heldJobs?(): Promise<HeldJobs | null>;
}
export type Exclusive = <T>(work: () => Promise<T>) => Promise<T>;
type Store = Record<string, unknown>;
type Verified = {
  status: StorageStatus;
  state:
    | StoredState
    | ((Checkpoint | RecoveryState) & { data: CanonicalData })
    | null;
  reachable: Set<string>;
};

function decoded<T>(schema: v.GenericSchema<T>, value: unknown): T {
  const result = v.safeParse(schema, value);
  requireCondition(result.success, 'INTEGRITY_CHECK_FAILED');
  return result.output;
}
function recordKey(kind: 'backup' | 'stage' | 'state', hash: string): string {
  return storagePrefix + kind + ':' + hash;
}
function knownKeys(store: Store) {
  for (const key of Object.keys(store).filter((key) =>
    key.startsWith(storagePrefix),
  ))
    requireCondition(
      key === headKey ||
        key === storagePrefix + 'draft' ||
        key === storagePrefix + 'job-epoch' ||
        /^buo:v2:content:(list|settings|metadata):[a-f0-9]{64}$/.test(key) ||
        /^buo:v2:(gc|archive-proof|quarantine|job-gc|recovery-review):[a-f0-9]{64}$/.test(
          key,
        ) ||
        /^buo:v2:(backup|stage|state|job|job-plan|job-state|draft-state|snapshot|transfer|sync-backup):[a-f0-9]{64}$/.test(
          key,
        ) ||
        /^buo:v2:job-result:[a-f0-9]{64}:(0|[1-9]\d*)$/.test(key),
      'UNKNOWN_STORAGE_VERSION',
    );
}

async function verifiedBackup(hash: string, store: Store): Promise<Backup> {
  const backup = decoded(backupSchema, store[recordKey('backup', hash)]);
  requireCondition(
    backup.digest === hash && (await digest(backup.sources)) === hash,
    'INTEGRITY_CHECK_FAILED',
  );
  requireCondition(
    !Object.keys(backup.sources.storageLocal).some((key) =>
      key.startsWith(storagePrefix),
    ),
    'INTEGRITY_CHECK_FAILED',
  );
  return backup;
}

async function verifiedTransfer(hash: string, store: Store) {
  const record = decoded(
    transferRecordSchema,
    store[storagePrefix + 'transfer:' + hash],
  );
  requireCondition((await digest(record)) === hash, 'INTEGRITY_CHECK_FAILED');
  return record;
}

async function verifyLegacy(store: Store): Promise<Verified> {
  knownKeys(store);
  const reachable = new Set<string>();
  if (!Object.hasOwn(store, headKey))
    return {
      status: {
        status: 'uninitialized',
        head: null,
        data: null,
        canRollback: false,
      },
      state: null,
      reachable,
    };
  const head = decoded(headSchema, store[headKey]);
  const visited = new Set<string>();
  async function stateAt(ref: Head): Promise<StoredState> {
    requireCondition(!visited.has(ref.stateDigest), 'INTEGRITY_CHECK_FAILED');
    visited.add(ref.stateDigest);
    reachable.add(ref.stateDigest);
    const state = decoded(
      stateSchema,
      store[recordKey('state', ref.stateDigest)],
    );
    requireCondition(
      (await digest(state)) === ref.stateDigest &&
        state.revision === ref.revision,
      'INTEGRITY_CHECK_FAILED',
    );
    requireCondition(
      state.revision === (state.previous?.revision ?? 0) + 1,
      'INTEGRITY_CHECK_FAILED',
    );
    await verifiedBackup(state.backupDigest, store);
    const stage = decoded(
      stageSchema,
      store[recordKey('stage', state.stageDigest)],
    );
    requireCondition(
      (await digest(stage)) === state.stageDigest &&
        stage.backupDigest === state.backupDigest,
      'INTEGRITY_CHECK_FAILED',
    );
    const previous = state.previous ? await stateAt(state.previous) : null;
    if (state.kind === 'mutation') {
      if (state.operation.command.kind === 'library.replace') {
        const record = await verifiedTransfer(
          state.operation.command.sourceDigest,
          store,
        );
        requireCondition(
          sameContent(record.baseHead, state.previous) &&
            record.source !== 'sync-upload',
          'INTEGRITY_CHECK_FAILED',
        );
      }
      requireCondition(
        previous?.data &&
          state.restoreTarget === null &&
          state.backupDigest === previous.backupDigest &&
          state.stageDigest === previous.stageDigest,
        'INTEGRITY_CHECK_FAILED',
      );
      requireCondition(
        state.operation.requestDigest ===
          (await digest({
            expectedHead: state.previous,
            command: state.operation.command,
          })),
        'INTEGRITY_CHECK_FAILED',
      );
      requireCondition(
        sameContent(
          state.data,
          applyLibraryCommand(
            previous.data,
            state.operation.command,
            state.operation.id,
          ),
        ),
        'INTEGRITY_CHECK_FAILED',
      );
    } else if (state.kind === 'migration' || state.kind === 'session') {
      requireCondition(
        state.restoreTarget === null &&
          state.data !== null &&
          sameContent(state.data, stage.data) &&
          sameContent(state.previous, stage.baseHead),
        'INTEGRITY_CHECK_FAILED',
      );
      requireCondition(
        previous === null ||
          (previous.kind === 'rollback' && previous.data === null),
        'INTEGRITY_CHECK_FAILED',
      );
    } else if (state.kind === 'rollback') {
      requireCondition(
        previous?.kind === 'migration' &&
          sameContent(state.restoreTarget, previous.previous),
        'INTEGRITY_CHECK_FAILED',
      );
      const target = state.restoreTarget
        ? decoded(
            stateSchema,
            store[recordKey('state', state.restoreTarget.stateDigest)],
          )
        : null;
      // The target is already verified through the previous state's ancestry.
      requireCondition(
        sameContent(state.data, target?.data ?? null) &&
          state.stageDigest === previous.stageDigest &&
          state.backupDigest === previous.backupDigest,
        'INTEGRITY_CHECK_FAILED',
      );
    }
    return state;
  }
  const state = await stateAt(head);
  return {
    status: {
      status: state.data === null ? 'rolled-back' : 'ready',
      head,
      data: state.data,
      canRollback:
        state.kind === 'migration' &&
        !Object.keys(store).some((key) =>
          key.startsWith(storagePrefix + 'job:'),
        ),
    },
    state,
    reachable,
  };
}

async function verify(store: Store): Promise<Verified> {
  knownKeys(store);
  if (!Object.hasOwn(store, headKey)) return verifyLegacy(store);
  const head = decoded(headSchema, store[headKey]);
  if (isRecoveryState(store[stateKey(head.stateDigest)])) {
    const recovered = await readRecoveryState(store, head);
    return {
      status: {
        status: 'ready',
        head,
        data: recovered.data,
        canRollback: false,
      },
      state: { ...recovered.state, data: recovered.data },
      reachable: new Set([head.stateDigest]),
    };
  }
  if (!isCheckpoint(store[stateKey(head.stateDigest)]))
    return verifyLegacy(store);
  const current = await checkpointReachability(store, head);
  requireCondition(current.state, 'INTEGRITY_CHECK_FAILED');
  return {
    status: { status: 'ready', head, data: current.data, canRollback: false },
    state: { ...current.state, data: current.data },
    reachable: current.heads,
  };
}

// Archive only verified, acknowledged preview ancestry. A transfer review that
// was never applied is unresolved input, even if its file is well formed.
async function previewArchiveRecords(store: Store) {
  const current = await verify(store);
  const history = new Set<string>();
  for (const hash of current.reachable) {
    if (history.has(hash)) continue;
    const raw = v.safeParse(stateSchema, store[stateKey(hash)]);
    if (!raw.success) continue;
    try {
      const old = await verifyLegacy({
        ...store,
        [headKey]: {
          schemaVersion: 1,
          revision: raw.output.revision,
          stateDigest: hash,
        },
      });
      for (const ancestor of old.reachable) history.add(ancestor);
    } catch {
      /* Incomplete or damaged ancestry stays protected. */
    }
  }
  const consumed = new Set<string>();
  for (const hash of history) {
    const raw = v.parse(stateSchema, store[stateKey(hash)]);
    if (
      raw.kind === 'mutation' &&
      raw.operation.command.kind === 'library.replace'
    )
      consumed.add(
        storagePrefix + 'transfer:' + raw.operation.command.sourceDigest,
      );
  }
  const records = [];
  for (const [key, value] of Object.entries(store)) {
    if (
      key.startsWith(storagePrefix + 'state:') &&
      !history.has(key.slice((storagePrefix + 'state:').length))
    )
      continue;
    if (key.startsWith(storagePrefix + 'transfer:') && !consumed.has(key))
      continue;
    if (await archiveEligible(key, value))
      records.push({ key, digest: await digest(value) });
  }
  return records;
}

// Recovery imports use the same verifier as the live store, without writing it.
export async function readRecoveryStore(
  store: Store,
): Promise<CanonicalData | null> {
  return (await verify(store)).status.data;
}

export class StorageCoordinator {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly port: StoragePort,
    private readonly exclusive: Exclusive,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly jobSignal: () => Promise<void> = () => Promise.resolve(),
  ) {}

  private run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => this.exclusive(work));
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async local(): Promise<Store> {
    try {
      return await this.port.readLocal();
    } catch (reason) {
      if (
        reason instanceof MigrationError &&
        ['PRIVATE_SESSION_ENDED', 'PRIVATE_SESSION_INVALID'].includes(
          reason.code,
        )
      )
        throw reason;
      throw new MigrationError('STORAGE_READ_FAILED');
    }
  }
  private async capture(
    document: Record<string, string>,
    includeManaged = false,
  ): Promise<Sources> {
    let local: Store, sync: Store;
    try {
      [local, sync] = await Promise.all([
        this.port.readLocal(),
        this.port.readSync(),
      ]);
    } catch {
      throw new MigrationError('STORAGE_READ_FAILED');
    }
    return decoded(sourcesSchema, {
      localStorage: decoded(documentSchema, document),
      storageLocal: Object.fromEntries(
        Object.entries(local).filter(
          ([key]) => includeManaged || !key.startsWith(storagePrefix),
        ),
      ),
      storageSync: sync,
    });
  }
  private async write(key: string, value: unknown): Promise<void> {
    requireCondition(key.startsWith(storagePrefix), 'INVALID_STORAGE_KEY');
    try {
      await this.port.writeLocal({ [key]: value });
    } catch (reason) {
      if (
        reason instanceof MigrationError &&
        ['PRIVATE_SESSION_ENDED', 'PRIVATE_SESSION_INVALID'].includes(
          reason.code,
        )
      )
        throw reason;
      throw new MigrationError('STORAGE_WRITE_FAILED');
    }
    requireCondition(
      sameContent((await this.local())[key], value),
      'WRITE_VERIFICATION_FAILED',
    );
  }
  private async append(key: string, value: unknown): Promise<void> {
    const existing = await this.local();
    if (Object.hasOwn(existing, key)) {
      requireCondition(
        sameContent(existing[key], value),
        'IMMUTABLE_RECORD_CONFLICT',
      );
      return;
    }
    await this.write(key, value);
  }
  private async unchanged(document: Record<string, string>, expected: string) {
    requireCondition(
      (await digest(await this.capture(document))) === expected,
      'SOURCES_CHANGED',
    );
  }
  private async publish(
    head: Head,
    expected: Head | null,
  ): Promise<StorageStatus> {
    const current = await verify(await this.local());
    requireCondition(
      sameContent(current.status.head, expected),
      'REVISION_CONFLICT',
    );
    await this.write(headKey, head);
    const result = await verify(await this.local());
    requireCondition(
      sameContent(result.status.head, head),
      'REVISION_CONFLICT',
    );
    return result.status;
  }

  status(): Promise<StorageStatus> {
    return this.run(async () => (await verify(await this.local())).status);
  }

  private corruptionRecovery() {
    return new CorruptionRecovery({
      read: () => this.local(),
      capture: (document) => this.capture(document, true),
      append: (key, value) => this.append(key, value),
      write: (key, value) => this.write(key, value),
      verify: async (store) => (await verify(store)).status,
      readRecovery: readRecoveryStore,
      known: knownKeys,
      now: this.now,
    });
  }
  recoveryAvailable() {
    return this.run(() => this.corruptionRecovery().available());
  }
  previewRecovery(
    document: Record<string, string>,
    archive: PackedJson,
    source: RecoverySource,
  ) {
    return this.run(() =>
      this.corruptionRecovery().preview(document, archive, source),
    );
  }
  activateRecovery(document: Record<string, string>, input: RecoveryApply) {
    return this.run(() => this.corruptionRecovery().apply(document, input));
  }

  async requireActiveData(): Promise<{
    head: Head;
    data: NonNullable<StorageStatus['data']>;
  }> {
    const status = await this.status();
    requireCondition(
      status.status === 'ready' && status.head && status.data,
      'MIGRATION_REQUIRED',
    );
    return { head: status.head, data: status.data };
  }

  mutate(raw: MutationInput): Promise<StorageStatus> {
    return this.run(() => this.mutateLocked(raw));
  }
  private async mutateLocked(
    raw: MutationInput,
    materialize = false,
  ): Promise<StorageStatus> {
    const input = decoded(mutationInputSchema, raw);
    const store = await this.local();
    const current = await verify(store);
    requireCondition(
      current.status.head && current.status.data && current.state,
      'MIGRATION_REQUIRED',
    );
    const recovered = await recoveryProtection(store);
    const suspended = await quarantines(store, recovered);
    requireCondition(
      !suspended.some((entry) => entry.operationId === input.id),
      'OPERATION_QUARANTINED',
    );
    const suspendedIds = new Set(suspended.map((entry) => entry.stateDigest));
    for (const key of recovered)
      if (key.startsWith(storagePrefix + 'state:'))
        suspendedIds.add(key.slice((storagePrefix + 'state:').length));
    const requestDigest = await digest({
      expectedHead: input.expectedHead,
      command: input.command,
    });
    const receipts: CheckpointReceipt[] =
      current.state.kind === 'checkpoint' ? current.state.receipts : [];
    for (const receipt of receipts)
      if (receipt.id === input.id) {
        requireCondition(
          receipt.requestDigest === requestDigest,
          'OPERATION_ID_REUSED',
        );
        await this.collect(current.status.head);
        return current.status;
      }
    for (const hash of current.reachable) {
      const parsed = v.safeParse(stateSchema, store[stateKey(hash)]);
      if (parsed.success && parsed.output.kind === 'mutation') {
        receipts.push({
          id: parsed.output.operation.id,
          requestDigest: parsed.output.operation.requestDigest,
        });
        if (parsed.output.operation.id === input.id) {
          requireCondition(
            parsed.output.operation.requestDigest === requestDigest,
            'OPERATION_ID_REUSED',
          );
          return current.status;
        }
      }
    }
    requireCondition(
      sameContent(current.status.head, input.expectedHead),
      'REVISION_CONFLICT',
    );
    for (const [key, value] of Object.entries(store).filter(([key]) =>
      key.startsWith(storagePrefix + 'state:'),
    )) {
      const hash = key.slice((storagePrefix + 'state:').length);
      if (current.reachable.has(hash) || suspendedIds.has(hash)) continue;
      if (isRecoveryState(value)) {
        const old = decoded(recoveryStateSchema, value);
        requireCondition(
          old.revision <= current.status.head.revision,
          'PENDING_MUTATION',
        );
        continue;
      }
      if (isCheckpoint(value)) {
        const staged = decoded(checkpointSchema, value);
        if (staged.revision > current.status.head.revision) {
          requireCondition(
            sameContent(staged.operation.expectedHead, input.expectedHead) &&
              staged.operation.id === input.id,
            'PENDING_MUTATION',
          );
          requireCondition(
            staged.operation.requestDigest === requestDigest,
            'OPERATION_ID_REUSED',
          );
        }
      } else {
        const old = decoded(stateSchema, value);
        if (
          current.state.kind !== 'checkpoint' ||
          old.revision > current.status.head.revision
        )
          requireCondition(
            old.kind === 'mutation' &&
              old.operation.id === input.id &&
              old.operation.requestDigest === requestDigest,
            'PENDING_MUTATION',
          );
      }
    }
    if (input.command.kind === 'library.replace') {
      const transfer = await verifiedTransfer(
        input.command.sourceDigest,
        store,
      );
      requireCondition(
        sameContent(transfer.baseHead, input.expectedHead) &&
          transfer.source !== 'sync-upload',
        'INTEGRITY_CHECK_FAILED',
      );
    }
    const next = applyLibraryCommand(
      current.status.data,
      input.command,
      input.id,
    );
    const plan = await planCheckpoint(
      store,
      {
        head: current.status.head,
        data: current.status.data,
        backupDigest: current.state.backupDigest,
        stageDigest: current.state.stageDigest,
      },
      input,
      next,
      current.state.kind === 'checkpoint' ? receipts : receipts.reverse(),
      materialize,
    );
    // Persist intent before component blobs. An interrupted save retains its
    // identity and references, so its user input cannot become anonymous garbage.
    await this.append(stateKey(plan.head.stateDigest), plan.state);
    for (const [key, value] of Object.entries(plan.writes))
      await this.append(key, value);
    await verify({ ...(await this.local()), [headKey]: plan.head });
    const result = await this.publish(plan.head, input.expectedHead);
    await this.collect(plan.head);
    return result;
  }

  private async remove(keys: string[]) {
    requireCondition(
      this.port.removeLocal &&
        keys.every((key) => key.startsWith(storagePrefix)),
      'INVALID_STORAGE_KEY',
    );
    try {
      await this.port.removeLocal(keys);
    } catch (reason) {
      if (
        reason instanceof MigrationError &&
        ['PRIVATE_SESSION_ENDED', 'PRIVATE_SESSION_INVALID'].includes(
          reason.code,
        )
      )
        throw reason;
      throw new MigrationError('STORAGE_WRITE_FAILED');
    }
    const stored = await this.local();
    requireCondition(
      keys.every((key) => !Object.hasOwn(stored, key)),
      'WRITE_VERIFICATION_FAILED',
    );
  }
  private async collect(head: Head) {
    try {
      if (
        !this.port.removeLocal ||
        !isCheckpoint((await this.local())[stateKey(head.stateDigest)])
      )
        return;
      const io = {
        read: () => this.local(),
        append: (key: string, value: unknown) => this.append(key, value),
        remove: (keys: string[]) => this.remove(keys),
        now: this.now,
      };
      await collectCheckpoints(io, head);
      await finishArchiveProofs(io, head);
    } catch (reason) {
      if (
        reason instanceof MigrationError &&
        ['PRIVATE_SESSION_ENDED', 'PRIVATE_SESSION_INVALID'].includes(
          reason.code,
        )
      )
        throw reason;
      // Publication succeeded. Retain extra records and retry cleanup later;
      // never report a committed save as an invitation to submit a new operation.
    }
  }

  private workspaceStore(): WorkspaceStore {
    return new WorkspaceStore({
      read: () => this.local(),
      append: (key, value) => this.append(key, value),
      write: (key, value) => this.write(key, value),
    });
  }

  withWorkspace<T>(
    work: (
      store: WorkspaceStore,
      active: { head: Head; data: CanonicalData },
      commit: (input: MutationInput) => Promise<StorageStatus>,
      sync: {
        read: () => Promise<Store>;
      },
    ) => Promise<T>,
  ): Promise<T> {
    return this.run(async () => {
      const current = await verify(await this.local());
      requireCondition(
        current.status.head && current.status.data,
        'MIGRATION_REQUIRED',
      );
      return work(
        this.workspaceStore(),
        { head: current.status.head, data: current.status.data },
        (input) => this.mutateLocked(input),
        {
          read: async () => {
            try {
              return await this.port.readSync();
            } catch {
              throw new MigrationError('SYNC_READ_FAILED');
            }
          },
        },
      );
    });
  }

  pendingMutations(): Promise<
    { stateDigest: string; input: MutationInput | null }[]
  > {
    return this.run(async () => {
      const store = await this.local();
      const current = await verify(store);
      requireCondition(
        current.status.head && current.status.data,
        'MIGRATION_REQUIRED',
      );
      return this.pendingLocked(store, current);
    });
  }
  private async pendingLocked(store: Store, current: Verified) {
    requireCondition(
      current.status.head && current.status.data,
      'MIGRATION_REQUIRED',
    );
    const recovered = await recoveryProtection(store);
    const suspendedIds = new Set(
      (await quarantines(store, recovered)).map((entry) => entry.stateDigest),
    );
    for (const key of recovered)
      if (key.startsWith(storagePrefix + 'state:'))
        suspendedIds.add(key.slice((storagePrefix + 'state:').length));
    const pending: { stateDigest: string; input: MutationInput | null }[] = [];
    for (const [key, value] of Object.entries(store).filter(([key]) =>
      key.startsWith(storagePrefix + 'state:'),
    )) {
      const stateDigest = key.slice((storagePrefix + 'state:').length);
      if (current.reachable.has(stateDigest) || suspendedIds.has(stateDigest))
        continue;
      const recognized = v.safeParse(
        v.union([stateSchema, checkpointSchema, recoveryStateSchema]),
        value,
      );
      if (!recognized.success) {
        requireCondition(
          !(
            value &&
            typeof value === 'object' &&
            'schemaVersion' in value &&
            typeof value.schemaVersion === 'number' &&
            value.schemaVersion > 5
          ),
          'UNKNOWN_STORAGE_VERSION',
        );
        pending.push({ stateDigest, input: null });
        continue;
      }
      if (isRecoveryState(value)) {
        if (recognized.output.revision > current.status.head.revision)
          pending.push({ stateDigest, input: null });
        continue;
      }
      if (isCheckpoint(value)) {
        const state = decoded(checkpointSchema, value);
        if (state.revision <= current.status.head.revision) continue;
        if (!sameContent(state.operation.expectedHead, current.status.head)) {
          pending.push({ stateDigest, input: null });
          continue;
        }
        let input: MutationInput | null = null;
        try {
          const candidate = await new CheckpointReader(store).read({
            schemaVersion: 1,
            revision: state.revision,
            stateDigest,
          });
          input = {
            id: state.operation.id,
            expectedHead: state.operation.expectedHead,
            command: checkpointCommand(state, candidate.data),
          };
          requireCondition(
            sameContent(
              applyLibraryCommand(current.status.data, input.command, input.id),
              candidate.data,
            ),
            'INTEGRITY_CHECK_FAILED',
          );
        } catch {
          input = null;
          /* Partial or invalid candidates require original input or quarantine. */
        }
        pending.push({ stateDigest, input });
      } else {
        const state = decoded(stateSchema, value);
        if (
          current.state?.kind === 'checkpoint' &&
          state.revision <= current.status.head.revision
        )
          continue;
        let input: MutationInput | null = null;
        if (
          state.kind === 'mutation' &&
          sameContent(state.previous, current.status.head)
        ) {
          try {
            await verify({
              ...store,
              [headKey]: {
                schemaVersion: 1,
                revision: state.revision,
                stateDigest,
              },
            });
            input = {
              id: state.operation.id,
              expectedHead: state.previous,
              command: state.operation.command,
            };
          } catch {
            /* Keep invalid inactive history available for verified quarantine. */
          }
        }
        pending.push({ stateDigest, input });
      }
    }
    return pending;
  }

  quarantineMutation(
    document: Record<string, string>,
    raw: unknown,
    stateDigest: string,
    expected: Head,
  ) {
    return this.run(async () => {
      const store = await this.local();
      const current = await verify(store);
      requireCondition(
        current.status.head && current.status.data,
        'MIGRATION_REQUIRED',
      );
      if (
        (await quarantines(store)).some(
          (entry) => entry.stateDigest === stateDigest,
        )
      )
        return current.status;
      requireCondition(
        sameContent(current.status.head, expected),
        'REVISION_CONFLICT',
      );
      requireCondition(
        (await this.pendingLocked(store, current)).some(
          (entry) => entry.stateDigest === stateDigest,
        ),
        'PENDING_CHANGE_NOT_FOUND',
      );
      const archive = decoded(recoveryExportSchema, await unpackJson(raw));
      requireCondition(
        (await digest(archive.sources)) === archive.digest,
        'RECOVERY_DIGEST_MISMATCH',
      );
      requireCondition(
        (await digest(await this.capture(document, true))) === archive.digest,
        'ARCHIVE_SOURCES_CHANGED',
      );
      const receipt = {
        schemaVersion: 1 as const,
        stateDigest,
        recordDigest: await digest(store[stateKey(stateDigest)]),
        archiveDigest: await digest(archive),
        expectedHead: expected,
        ...quarantineReferences(store, stateDigest),
        createdAt: this.now(),
      };
      await this.append(
        storagePrefix + 'quarantine:' + (await digest(receipt)),
        receipt,
      );
      await quarantines(await this.local());
      return current.status;
    });
  }

  withJobs<T>(
    work: (
      journal: JobJournal,
      active: { head: Head; data: CanonicalData },
    ) => Promise<T>,
  ): Promise<T> {
    return this.run(async () => {
      const current = await verify(await this.local());
      requireCondition(
        current.status.head && current.status.data,
        'MIGRATION_REQUIRED',
      );
      const journal = this.jobJournal();
      const result = await work(journal, {
        head: current.status.head,
        data: current.status.data,
      });
      if (
        journal.terminalChanged ||
        Object.keys(await this.local()).some((key) =>
          key.startsWith(storagePrefix + 'job-gc:'),
        )
      ) {
        try {
          await journal.maintain();
        } catch (reason) {
          if (
            reason instanceof MigrationError &&
            ['PRIVATE_SESSION_ENDED', 'PRIVATE_SESSION_INVALID'].includes(
              reason.code,
            )
          )
            throw reason;
          // Keep completed history when maintenance cannot be safely verified.
        }
      }
      return result;
    });
  }

  private jobJournal() {
    return new JobJournal({
      signal: this.jobSignal,
      read: () => this.local(),
      append: (key, value) => this.append(key, value),
      write: (key, value) => this.write(key, value),
      ...(this.port.removeLocal
        ? { remove: (keys: string[]) => this.remove(keys) }
        : {}),
      ...(this.port.heldJobs ? { heldJobs: () => this.port.heldJobs!() } : {}),
    });
  }
  openingEpoch() {
    return this.run(async () => {
      requireCondition(
        (await verify(await this.local())).status.status === 'ready',
        'MIGRATION_REQUIRED',
      );
      return openingEpoch(await this.local());
    });
  }

  prepare(document: Record<string, string>): Promise<MigrationReview> {
    return this.run(async () => {
      const current = await verify(await this.local());
      requireCondition(current.status.data === null, 'ALREADY_ACTIVE');
      const sources = await this.capture(document);
      const hash = await digest(sources);
      const key = recordKey('backup', hash);
      const local = await this.local();
      if (Object.hasOwn(local, key)) await verifiedBackup(hash, local);
      else {
        const backup: Backup = {
          schemaVersion: 1,
          capturedAt: this.now(),
          digest: hash,
          sources,
        };
        await this.append(key, decoded(backupSchema, backup));
        await verifiedBackup(hash, await this.local());
      }
      await this.unchanged(document, hash);
      const stored = await this.local();
      const orphans = Object.keys(stored).filter(
        (key) =>
          key.startsWith(storagePrefix + 'state:') &&
          !current.reachable.has(key.slice((storagePrefix + 'state:').length)),
      );
      let resumeDecisions: Decisions | null = null;
      if (orphans.length) {
        requireCondition(orphans.length === 1, 'ORPHANED_STATE');
        const key = orphans[0]!;
        const state = decoded(stateSchema, stored[key]);
        const ref: Head = {
          schemaVersion: 1,
          revision: state.revision,
          stateDigest: key.slice((storagePrefix + 'state:').length),
        };
        await verify({ ...stored, [headKey]: ref });
        requireCondition(
          state.kind === 'migration' &&
            state.backupDigest === hash &&
            sameContent(state.previous, current.status.head),
          'ORPHANED_STATE',
        );
        const stage = decoded(
          stageSchema,
          stored[recordKey('stage', state.stageDigest)],
        );
        resumeDecisions = stage.decisions;
      }
      return {
        backupDigest: hash,
        baseHead: current.status.head,
        resumeDecisions,
        plan: await analyzeSources(sources),
      };
    });
  }

  commit(
    document: Record<string, string>,
    receipt: Pick<MigrationReview, 'backupDigest' | 'baseHead'>,
    decisions: Decisions,
  ): Promise<StorageStatus> {
    return this.run(async () => {
      const local = await this.local();
      const current = await verify(local);
      const backup = await verifiedBackup(receipt.backupDigest, local);
      await this.unchanged(document, receipt.backupDigest);
      const data = createCandidate(
        await analyzeSources(backup.sources),
        decisions,
      );
      const stage: Stage = decoded(stageSchema, {
        schemaVersion: 1,
        backupDigest: receipt.backupDigest,
        baseHead: receipt.baseHead,
        decisions,
        data,
      });
      const stageDigest = await digest(stage);
      const state: StoredState = decoded(stateSchema, {
        schemaVersion: 1,
        revision: (receipt.baseHead?.revision ?? 0) + 1,
        kind: 'migration',
        previous: receipt.baseHead,
        backupDigest: receipt.backupDigest,
        stageDigest,
        restoreTarget: null,
        data,
      });
      const stateDigest = await digest(state);
      const head: Head = {
        schemaVersion: 1,
        revision: state.revision,
        stateDigest,
      };
      // A lost acknowledgement after writing the head is safe to retry.
      if (sameContent(current.status.head, head)) return current.status;
      requireCondition(
        sameContent(current.status.head, receipt.baseHead),
        'REVISION_CONFLICT',
      );
      requireCondition(current.status.data === null, 'ALREADY_ACTIVE');
      // Never initialize defaults over unexplained canonical records if a head vanished.
      for (const key of Object.keys(local).filter((key) =>
        key.startsWith(storagePrefix + 'state:'),
      ))
        requireCondition(
          key === recordKey('state', stateDigest) ||
            current.reachable.has(key.slice((storagePrefix + 'state:').length)),
          'ORPHANED_STATE',
        );
      await this.append(recordKey('stage', stageDigest), stage);
      await this.append(recordKey('state', stateDigest), state);
      await verify({ ...(await this.local()), [headKey]: head });
      await this.unchanged(document, receipt.backupDigest);
      return this.publish(head, receipt.baseHead);
    });
  }

  rollback(expected: Head): Promise<StorageStatus> {
    return this.run(async () => {
      const local = await this.local();
      const current = await verify(local);
      requireCondition(
        current.state && current.status.head,
        'MIGRATION_REQUIRED',
      );
      if (
        current.state.kind === 'rollback' &&
        sameContent(current.state.previous, expected)
      )
        return current.status;
      requireCondition(
        sameContent(current.status.head, expected),
        'REVISION_CONFLICT',
      );
      requireCondition(
        current.status.canRollback && current.state.kind === 'migration',
        'ROLLBACK_UNAVAILABLE',
      );
      const target = current.state.previous;
      const targetState = target
        ? decoded(stateSchema, local[recordKey('state', target.stateDigest)])
        : null;
      const state: StoredState = {
        schemaVersion: 1,
        revision: expected.revision + 1,
        kind: 'rollback',
        previous: expected,
        backupDigest: current.state.backupDigest,
        stageDigest: current.state.stageDigest,
        restoreTarget: target,
        data: targetState?.data ?? null,
      };
      const head: Head = {
        schemaVersion: 1,
        revision: state.revision,
        stateDigest: await digest(state),
      };
      for (const key of Object.keys(local).filter((key) =>
        key.startsWith(storagePrefix + 'state:'),
      ))
        requireCondition(
          key === recordKey('state', head.stateDigest) ||
            current.reachable.has(key.slice((storagePrefix + 'state:').length)),
          'PENDING_MUTATION',
        );
      await this.append(recordKey('state', head.stateDigest), state);
      await verify({ ...(await this.local()), [headKey]: head });
      return this.publish(head, expected);
    });
  }

  // Read-only and available even when canonical integrity or backup writes fail.
  exportRecovery(document: Record<string, string>): Promise<RecoveryExport> {
    return this.run(async () => {
      const sources = await this.capture(document, true);
      return {
        format: 'bulk-url-opener-recovery',
        schemaVersion: 1,
        capturedAt: this.now(),
        digest: await digest(sources),
        sources,
      };
    });
  }

  exportArchive(document: Record<string, string>): Promise<PackedJson> {
    return this.run(async () => {
      const sources = await this.capture(document, true);
      return packJson({
        format: 'bulk-url-opener-recovery',
        schemaVersion: 1,
        capturedAt: this.now(),
        digest: await digest(sources),
        sources,
      });
    });
  }

  storageInfo() {
    return this.run(() => this.storageInfoLocked());
  }
  recoveryCopies() {
    return this.run(async () => {
      const store = await this.local();
      const reader = new CheckpointReader(store);
      const results = [];
      for (const [key, raw] of Object.entries(store).filter(([key]) =>
        key.startsWith(storagePrefix + 'state:'),
      )) {
        const parsed = v.safeParse(
          v.union([stateSchema, checkpointSchema, recoveryStateSchema]),
          raw,
        );
        if (!parsed.success) continue;
        try {
          const id = key.slice((storagePrefix + 'state:').length);
          const entry = await reader.read({
            schemaVersion: 1,
            revision: parsed.output.revision,
            stateDigest: id,
          });
          results.push({
            id,
            revision: parsed.output.revision,
            lists: entry.data.lists.length,
          });
        } catch {
          /* A damaged copy remains in the full recovery archive. */
        }
      }
      return results
        .sort((a, b) => b.revision - a.revision)
        .slice(0, 1 + checkpointHistoryLimit);
    });
  }
  exportCopy(id: string) {
    return this.run(async () => {
      const store = await this.local();
      const state = decoded(
        v.union([stateSchema, checkpointSchema, recoveryStateSchema]),
        store[stateKey(id)],
      );
      const copy = await new CheckpointReader(store).read({
        schemaVersion: 1,
        revision: state.revision,
        stateDigest: id,
      });
      return JSON.stringify(toPortable(copy.data), null, 2);
    });
  }
  private async storageInfoLocked() {
    const store = await this.local();
    let format: 'legacy' | 'checkpoint' | 'uninitialized' | 'unverified' =
      'unverified';
    let recoveryPoints = 0;
    try {
      const current = await verify(store);
      format = current.status.data
        ? current.state?.kind === 'checkpoint'
          ? 'checkpoint'
          : 'legacy'
        : 'uninitialized';
      if (current.state?.kind === 'checkpoint')
        recoveryPoints = current.state.retained.length;
    } catch {
      /* Raw export remains available when integrity cannot be verified. */
    }
    let archiveableRecords = 0,
      archiveableBytes = 0;
    let estimatedBytes = 0;
    for (const [key, value] of Object.entries(store)) {
      estimatedBytes += recordBytes(key, value);
    }
    try {
      for (const record of await previewArchiveRecords(store)) {
        archiveableRecords++;
        archiveableBytes += recordBytes(record.key, store[record.key]);
      }
    } catch {
      /* Unverified sources can be exported, never automatically pruned. */
    }
    let completedJobs = 0,
      legacyCompletedJobs = 0;
    const jobBytes = Object.entries(store)
      .filter(([key]) => /^buo:v2:job(?:-|:)/.test(key))
      .reduce((total, [key, raw]) => total + recordBytes(key, raw), 0);
    try {
      for (const job of await this.jobJournal().list())
        if (job.run.status === 'completed') {
          completedJobs++;
          const raw = store[storagePrefix + 'job-plan:' + job.plan.id];
          if (raw && typeof raw === 'object' && !('schemaVersion' in raw))
            legacyCompletedJobs++;
        }
    } catch {
      /* Preserve unreadable job records; full recovery remains available. */
    }
    return {
      format,
      estimatedBytes,
      recoveryPoints,
      archiveableRecords,
      archiveableBytes,
      completedJobs,
      legacyCompletedJobs,
      jobBytes,
      cleanupPending: Object.entries(store).some(
        ([key, raw]) =>
          key.startsWith(storagePrefix + 'gc:') ||
          key.startsWith(storagePrefix + 'job-gc:') ||
          (key.startsWith(storagePrefix + 'archive-proof:') &&
            v.is(archiveProofSchema, raw)),
      ),
    };
  }

  compactArchive(document: Record<string, string>, raw: unknown) {
    return this.run(async () => {
      const archive = decoded(recoveryExportSchema, await unpackJson(raw));
      requireCondition(
        (await digest(archive.sources)) === archive.digest,
        'RECOVERY_DIGEST_MISMATCH',
      );
      const archiveDigest = await digest(archive);
      let store = await this.local();
      let authorized = false;
      for (const [key, value] of Object.entries(store).filter(([key]) =>
        key.startsWith(storagePrefix + 'archive-proof:'),
      )) {
        const proof = v.safeParse(
          v.union([archiveProofSchema, archiveReceiptSchema]),
          value,
        );
        if (
          proof.success &&
          proof.output.archiveDigest === archiveDigest &&
          (await digest(proof.output)) ===
            key.slice((storagePrefix + 'archive-proof:').length)
        )
          authorized = true;
      }
      if (!authorized) {
        requireCondition(
          (await digest(await this.capture(document, true))) === archive.digest,
          'ARCHIVE_SOURCES_CHANGED',
        );
        const records = await previewArchiveRecords(store);
        const proof = {
          schemaVersion: 1 as const,
          archiveDigest,
          sourcesDigest: archive.digest,
          records,
        };
        await this.append(
          storagePrefix + 'archive-proof:' + (await digest(proof)),
          proof,
        );
      }
      let current = await verify(await this.local());
      requireCondition(
        current.status.head && current.status.data,
        'MIGRATION_REQUIRED',
      );
      if (current.state?.kind !== 'checkpoint') {
        await this.mutateLocked({
          id: await digest({ archiveDigest, action: 'adopt' }),
          expectedHead: current.status.head,
          command: { kind: 'settings.update', patch: {} },
        });
      }
      current = await verify(await this.local());
      requireCondition(current.status.head, 'MIGRATION_REQUIRED');
      await this.collect(current.status.head);
      store = await this.local();
      const root = decoded(
        checkpointSchema,
        store[stateKey(current.status.head.stateDigest)],
      );
      if (root.base) {
        await this.mutateLocked(
          {
            id: await digest({ archiveDigest, action: 'materialize' }),
            expectedHead: current.status.head,
            command: { kind: 'settings.update', patch: {} },
          },
          true,
        );
      }
      await this.jobJournal().maintain({
        digest: archiveDigest,
        store: archive.sources.storageLocal,
      });
      return this.storageInfoLocked();
    });
  }

  backup(hash: string): Promise<Backup> {
    return this.run(async () =>
      verifiedBackup(hash, decoded(jsonObjectSchema, await this.local())),
    );
  }
}
