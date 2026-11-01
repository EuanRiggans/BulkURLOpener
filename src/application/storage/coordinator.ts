import * as v from 'valibot';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import { digest, jsonObjectSchema } from '../../domain/storage/json';
import { applyLibraryCommand } from '../../domain/library';
import { JobJournal } from './job-journal';
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
}
export type Exclusive = <T>(work: () => Promise<T>) => Promise<T>;
type Store = Record<string, unknown>;
type Verified = {
  status: StorageStatus;
  state: StoredState | null;
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
        /^buo:v2:(backup|stage|state|job|job-plan|job-state):[a-f0-9]{64}$/.test(
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

async function verify(store: Store): Promise<Verified> {
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
    } else if (state.kind === 'migration') {
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
    } catch {
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
    } catch {
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
    return this.run(async () => {
      const input = decoded(mutationInputSchema, raw);
      const store = await this.local();
      const current = await verify(store);
      requireCondition(
        current.status.head && current.status.data && current.state,
        'MIGRATION_REQUIRED',
      );
      const requestDigest = await digest({
        expectedHead: input.expectedHead,
        command: input.command,
      });
      for (const hash of current.reachable) {
        const ancestor = decoded(stateSchema, store[recordKey('state', hash)]);
        if (
          ancestor.kind === 'mutation' &&
          ancestor.operation.id === input.id
        ) {
          requireCondition(
            ancestor.operation.requestDigest === requestDigest,
            'OPERATION_ID_REUSED',
          );
          return current.status;
        }
      }
      requireCondition(
        sameContent(current.status.head, input.expectedHead),
        'REVISION_CONFLICT',
      );
      const state: StoredState = {
        schemaVersion: 2,
        kind: 'mutation',
        revision: input.expectedHead.revision + 1,
        previous: input.expectedHead,
        backupDigest: current.state.backupDigest,
        stageDigest: current.state.stageDigest,
        restoreTarget: null,
        data: applyLibraryCommand(current.status.data, input.command, input.id),
        operation: { id: input.id, command: input.command, requestDigest },
      };
      const stateDigest = await digest(state);
      for (const key of Object.keys(store).filter((key) =>
        key.startsWith(storagePrefix + 'state:'),
      ))
        requireCondition(
          key === recordKey('state', stateDigest) ||
            current.reachable.has(key.slice((storagePrefix + 'state:').length)),
          'PENDING_MUTATION',
        );
      const head: Head = {
        schemaVersion: 1,
        revision: state.revision,
        stateDigest,
      };
      await this.append(recordKey('state', stateDigest), state);
      await verify({ ...(await this.local()), [headKey]: head });
      return this.publish(head, input.expectedHead);
    });
  }

  pendingMutations(): Promise<{ stateDigest: string; input: MutationInput }[]> {
    return this.run(async () => {
      const store = await this.local();
      const current = await verify(store);
      requireCondition(
        current.status.head && current.status.data,
        'MIGRATION_REQUIRED',
      );
      const pending = [];
      for (const key of Object.keys(store).filter((key) =>
        key.startsWith(storagePrefix + 'state:'),
      )) {
        const stateDigest = key.slice((storagePrefix + 'state:').length);
        if (current.reachable.has(stateDigest)) continue;
        const state = decoded(stateSchema, store[key]);
        requireCondition(
          state.kind === 'mutation' &&
            sameContent(state.previous, current.status.head),
          'ORPHANED_STATE',
        );
        await verify({
          ...store,
          [headKey]: {
            schemaVersion: 1,
            revision: state.revision,
            stateDigest,
          },
        });
        pending.push({
          stateDigest,
          input: {
            id: state.operation.id,
            expectedHead: state.previous,
            command: state.operation.command,
          },
        });
      }
      return pending;
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
      const journal = new JobJournal({
        signal: this.jobSignal,
        read: () => this.local(),
        append: (key, value) => this.append(key, value),
        write: (key, value) => this.write(key, value),
      });
      return work(journal, {
        head: current.status.head,
        data: current.status.data,
      });
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

  backup(hash: string): Promise<Backup> {
    return this.run(async () =>
      verifiedBackup(hash, decoded(jsonObjectSchema, await this.local())),
    );
  }
}
