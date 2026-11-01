import { readFileSync } from 'node:fs';
import * as v from 'valibot';
import type {
  Exclusive,
  StoragePort,
} from '../../src/application/storage/coordinator';
import {
  sourcesSchema,
  type Decisions,
  type MigrationPlan,
  type Sources,
} from '../../src/domain/storage/schema';

export function profile(name: string): Sources {
  const raw = JSON.parse(
    readFileSync(
      new URL('../fixtures/legacy/' + name + '.json', import.meta.url),
      'utf8',
    ),
  ) as Sources;
  return v.parse(sourcesSchema, {
    localStorage: raw.localStorage,
    storageLocal: raw.storageLocal,
    storageSync: raw.storageSync,
  });
}
export function legacyExport(name: string): Sources {
  const raw = JSON.parse(
    readFileSync(
      new URL('../fixtures/legacy/' + name + '.json', import.meta.url),
      'utf8',
    ),
  ) as { settings: unknown; lists: { list_id: number }[]; maxID: string };
  return v.parse(sourcesSchema, {
    localStorage: {
      settings: JSON.stringify(raw.settings),
      maxID: raw.maxID,
      ...Object.fromEntries(
        raw.lists.map((list) => [String(list.list_id), JSON.stringify(list)]),
      ),
    },
    storageLocal: {},
    storageSync: {},
  });
}
export function reviewed(plan: MigrationPlan): Decisions {
  return {
    acknowledgeIssues: true,
    preferences: Object.fromEntries(
      plan.preferences.map(({ key, options }) => [key, options[0]!.id]),
    ),
    historical: Object.fromEntries(
      plan.lists
        .filter((list) => list.reconstructed)
        .map((list) => [list.id, 'include']),
    ),
  };
}
export const empty: Sources = {
  localStorage: {},
  storageLocal: {},
  storageSync: {},
};
export function mutex(): Exclusive {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>) => {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  };
}

export class MemoryStorage implements StoragePort {
  local: Record<string, unknown>;
  sync: Record<string, unknown>;
  writes: string[] = [];
  failAt = 0;
  failure: 'before' | 'after' | 'drop' | 'corrupt' = 'before';
  readFailure = false;
  constructor(source: Sources = empty) {
    this.local = structuredClone(source.storageLocal);
    this.sync = structuredClone(source.storageSync);
  }
  readLocal(): Promise<Record<string, unknown>> {
    if (this.readFailure)
      return Promise.reject(new Error('private backend error must not escape'));
    return Promise.resolve(structuredClone(this.local));
  }
  readSync(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.sync));
  }
  writeLocal(values: Record<string, unknown>): Promise<void> {
    this.writes.push(...Object.keys(values));
    const fail = this.failAt === this.writes.length;
    if (fail && this.failure === 'before')
      return Promise.reject(new Error('QUOTA_BYTES'));
    if (fail && this.failure === 'drop') return Promise.resolve();
    Object.assign(this.local, structuredClone(values));
    if (fail && this.failure === 'corrupt')
      for (const key of Object.keys(values)) this.local[key] = null;
    if (fail && this.failure === 'after')
      return Promise.reject(new Error('Interrupted after write'));
    return Promise.resolve();
  }
}
