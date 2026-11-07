import type { HeldJobs } from '../../domain/opening/history';
import * as v from 'valibot';
import {
  StorageCoordinator,
  readRecoveryStore,
  type Exclusive,
  type StoragePort,
} from './coordinator';
import {
  dataSchema,
  hashSchema,
  headKey,
  sessionStateSchema,
  storagePrefix,
  type CanonicalData,
} from '../../domain/storage/schema';
import { digest, jsonObjectSchema } from '../../domain/storage/json';
import { sameContent } from '../../domain/storage/migrate';
import { MigrationError, requireCondition } from '../../domain/storage/errors';

import { privatePrefix } from '../../shared/storage-events';
export { privatePrefix } from '../../shared/storage-events';
const metadataKey = privatePrefix + 'session';
const seedKey = privatePrefix + 'seed';
const metadataSchema = v.strictObject({
  schemaVersion: v.literal(1),
  id: hashSchema,
  windows: v.array(v.pipe(v.number(), v.safeInteger(), v.minValue(0))),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
});
type Metadata = v.InferOutput<typeof metadataSchema>;
type Store = Record<string, unknown>;
export interface SessionPort {
  read(): Promise<Store>;
  write(values: Store): Promise<void>;
  remove(keys: string[]): Promise<void>;
  windows(): Promise<number[]>;
  exclusive: Exclusive;
  token(): string;
  now(): string;
  signal(): Promise<void>;
  idle?(): Promise<void>;
  heldJobs?(): Promise<HeldJobs | null>;
}
export type PrivateWorkspace = { id: string; storage: StorageCoordinator };

// An explicit session baseline reuses the canonical verifier and command/job
// services. Its namespace is mapped to the browser's ephemeral private store.
export async function sessionSeed(
  raw: CanonicalData,
  sessionId: string,
  createdAt: string,
): Promise<Store> {
  const data = v.parse(dataSchema, {
    ...structuredClone(raw),
    draftLines: null,
    recoveredInputs: [],
    settings: { ...raw.settings, openOnLaunch: null },
  });
  const sources = { localStorage: {}, storageLocal: {}, storageSync: {} };
  const backupDigest = await digest(sources);
  const backup = {
    schemaVersion: 1,
    capturedAt: createdAt,
    digest: backupDigest,
    sources,
  };
  const stage = {
    schemaVersion: 1,
    backupDigest,
    baseHead: null,
    decisions: { acknowledgeIssues: true, preferences: {}, historical: {} },
    data,
  };
  const stageDigest = await digest(stage);
  const state = {
    schemaVersion: 3,
    kind: 'session',
    revision: 1,
    previous: null,
    backupDigest,
    stageDigest,
    restoreTarget: null,
    data,
    sessionId,
  };
  const stateDigest = await digest(state);
  const records = {
    [storagePrefix + 'backup:' + backupDigest]: backup,
    [storagePrefix + 'stage:' + stageDigest]: stage,
    [storagePrefix + 'state:' + stateDigest]: state,
    [headKey]: { schemaVersion: 1, revision: 1, stateDigest },
  };
  requireCondition(await readRecoveryStore(records), 'PRIVATE_SESSION_INVALID');
  return records;
}
function parsed<T>(schema: v.GenericSchema<T>, raw: unknown): T {
  const result = v.safeParse(schema, raw);
  requireCondition(result.success, 'PRIVATE_SESSION_INVALID');
  return result.output;
}
export class SessionWorkspace {
  private queue: Promise<unknown> = Promise.resolve();
  private cached: PrivateWorkspace | null = null;
  constructor(
    private readonly port: SessionPort,
    private readonly regular: StorageCoordinator,
  ) {}
  private run<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(() => this.port.exclusive(work));
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  private async write(values: Store) {
    try {
      await this.port.write(values);
    } catch {
      throw new MigrationError('STORAGE_WRITE_FAILED');
    }
    const stored = await this.port.read();
    requireCondition(
      Object.entries(values).every(([key, value]) =>
        sameContent(stored[key], value),
      ),
      'WRITE_VERIFICATION_FAILED',
    );
  }
  private async erase() {
    const keys = Object.keys(await this.port.read()).filter((key) =>
      key.startsWith(privatePrefix),
    );
    if (keys.length) await this.port.remove(keys);
    requireCondition(
      !Object.keys(await this.port.read()).some((key) =>
        key.startsWith(privatePrefix),
      ),
      'WRITE_VERIFICATION_FAILED',
    );
    this.cached = null;
    await this.port.idle?.();
  }
  async assertSession(id: string): Promise<void> {
    const raw = (await this.port.read())[metadataKey];
    requireCondition(
      raw !== undefined && parsed(metadataSchema, raw).id === id,
      'PRIVATE_SESSION_ENDED',
    );
  }
  private logical(store: Store): Store {
    return Object.fromEntries(
      Object.entries(store)
        .filter(([key]) => key.startsWith(privatePrefix + storagePrefix))
        .map(([key, value]) => [key.slice(privatePrefix.length), value]),
    );
  }
  private async initialize(metadata: Metadata): Promise<PrivateWorkspace> {
    const records = this.logical(await this.port.read());
    if (
      !Object.hasOwn(records, headKey) &&
      (Object.keys(records).length === 0 ||
        Object.hasOwn(await this.port.read(), seedKey))
    ) {
      let seed: Store;
      const pending = (await this.port.read())[seedKey];
      if (pending !== undefined) seed = parsed(jsonObjectSchema, pending);
      else {
        requireCondition(
          Object.keys(records).length === 0,
          'PRIVATE_SESSION_INVALID',
        );
        let source: CanonicalData;
        try {
          source = (await this.regular.requireActiveData()).data;
        } catch (reason) {
          if (
            reason instanceof MigrationError &&
            reason.code === 'MIGRATION_REQUIRED'
          )
            throw new MigrationError('PRIVATE_SETUP_REQUIRED');
          throw reason;
        }
        seed = await sessionSeed(source, metadata.id, metadata.createdAt);
        await this.write({ [seedKey]: seed });
      }
      requireCondition(
        await readRecoveryStore(seed),
        'PRIVATE_SESSION_INVALID',
      );
      for (const [key, value] of Object.entries(seed).filter(
        ([key]) => key !== headKey,
      )) {
        const actual = (await this.port.read())[privatePrefix + key];
        if (actual === undefined)
          await this.write({ [privatePrefix + key]: value });
        else
          requireCondition(
            sameContent(actual, value),
            'PRIVATE_SESSION_INVALID',
          );
      }
      await this.write({ [privatePrefix + headKey]: seed[headKey] });
      requireCondition(
        await readRecoveryStore(this.logical(await this.port.read())),
        'PRIVATE_SESSION_INVALID',
      );
      await this.port.remove([seedKey]);
    }
    if (this.cached?.id === metadata.id) return this.cached;
    const activeRecords = this.logical(await this.port.read());
    try {
      if (Object.hasOwn(activeRecords, headKey))
        requireCondition(
          await readRecoveryStore(activeRecords),
          'PRIVATE_SESSION_INVALID',
        );
    } catch (reason) {
      // Keep the existing epoch-bound coordinator available to the Data page's
      // explicit recovery flow. Ordinary services retain their canonical gate.
      if (
        !(reason instanceof MigrationError) ||
        !['INTEGRITY_CHECK_FAILED', 'RECOVERY_REVIEW_INVALID'].includes(
          reason.code,
        )
      )
        throw reason;
    }
    const roots = Object.entries(activeRecords)
      .filter(([key]) => key.startsWith(storagePrefix + 'state:'))
      .flatMap(([, value]) => {
        const parsed = v.safeParse(sessionStateSchema, value);
        return parsed.success ? [parsed.output] : [];
      });
    requireCondition(
      roots.length === 1 && roots[0]!.sessionId === metadata.id,
      'PRIVATE_SESSION_INVALID',
    );
    if (Object.hasOwn(await this.port.read(), seedKey))
      await this.port.remove([seedKey]);
    const port: StoragePort = {
      ...(this.port.heldJobs
        ? {
            heldJobs: async () => {
              await this.assertSession(metadata.id);
              const result = await this.port.heldJobs!();
              return result ? { ...result, sessionId: metadata.id } : null;
            },
          }
        : {}),
      readLocal: async () => {
        await this.assertSession(metadata.id);
        return this.logical(await this.port.read());
      },
      readSync: () => Promise.resolve({}),
      writeLocal: async (values) => {
        await this.assertSession(metadata.id);
        requireCondition(
          Object.keys(values).every((key) => key.startsWith(storagePrefix)),
          'INVALID_STORAGE_KEY',
        );
        await this.write(
          Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
              privatePrefix + key,
              value,
            ]),
          ),
        );
      },
      removeLocal: async (keys) => {
        await this.assertSession(metadata.id);
        requireCondition(
          keys.every(
            (key) =>
              /^buo:v2:(snapshot|state|gc|transfer|job|job-plan|job-state|job-gc):[a-f0-9]{64}$/.test(
                key,
              ) ||
              /^buo:v2:job-result:[a-f0-9]{64}:(0|[1-9]\d*)$/.test(key) ||
              /^buo:v2:content:(list|settings|metadata):[a-f0-9]{64}$/.test(
                key,
              ),
          ),
          'INVALID_STORAGE_KEY',
        );
        await this.port.remove(keys.map((key) => privatePrefix + key));
      },
    };
    this.cached = {
      id: metadata.id,
      storage: new StorageCoordinator(
        port,
        this.port.exclusive,
        () => this.port.now(),
        () => this.port.signal(),
      ),
    };
    return this.cached;
  }
  open(windowId: number): Promise<PrivateWorkspace> {
    return this.run(async () => {
      const windows = await this.port.windows();
      requireCondition(windows.includes(windowId), 'PRIVATE_SESSION_ENDED');
      const raw = (await this.port.read())[metadataKey];
      let metadata = raw === undefined ? null : parsed(metadataSchema, raw);
      if (metadata && !metadata.windows.some((id) => windows.includes(id))) {
        await this.erase();
        metadata = null;
      }
      if (!metadata) {
        requireCondition(
          !Object.keys(await this.port.read()).some((key) =>
            key.startsWith(privatePrefix),
          ),
          'PRIVATE_SESSION_INVALID',
        );
        metadata = {
          schemaVersion: 1,
          id: this.port.token(),
          createdAt: this.port.now(),
          windows,
        };
      } else metadata = { ...metadata, windows };
      await this.write({ [metadataKey]: metadata });
      return this.initialize(metadata);
    });
  }
  existing(): Promise<PrivateWorkspace | null> {
    return this.run(async () => {
      const windows = await this.port.windows();
      if (!windows.length) {
        await this.erase();
        return null;
      }
      const raw = (await this.port.read())[metadataKey];
      if (raw === undefined) return null;
      const metadata = parsed(metadataSchema, raw);
      if (!metadata.windows.some((id) => windows.includes(id))) {
        await this.erase();
        return null;
      }
      await this.write({ [metadataKey]: { ...metadata, windows } });
      return this.initialize(metadata);
    });
  }
  noteWindow(id: number): Promise<void> {
    return this.run(async () => {
      const raw = (await this.port.read())[metadataKey];
      if (raw === undefined) return;
      const metadata = parsed(metadataSchema, raw);
      if (!metadata.windows.includes(id))
        await this.write({
          [metadataKey]: { ...metadata, windows: [...metadata.windows, id] },
        });
    });
  }
}
