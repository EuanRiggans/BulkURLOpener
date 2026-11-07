import type { HeldJobs } from '../../domain/opening/history';
import * as v from 'valibot';
import {
  completedJobBytes,
  completedJobLimit,
  initialOpeningEpoch,
  jobGcSchema,
  openingEpochSchema,
} from '../../domain/opening/history';
import {
  jobHeadSchema,
  planEnvelopeSchema,
  receiptEnvelopeSchema,
  runSchema,
  type JobPlan,
  type JobRun,
} from '../../domain/opening/schema';
import { digest } from '../../domain/storage/json';
import { requireCondition } from '../../domain/storage/errors';
import { recordBytes } from './checkpoints';

type Store = Record<string, unknown>;
export interface JobMaintenanceIO {
  read(): Promise<Store>;
  append(key: string, value: unknown): Promise<void>;
  write(key: string, value: unknown): Promise<void>;
  remove?(keys: string[]): Promise<void>;
  heldJobs?(): Promise<HeldJobs | null>;
}
export const jobStateKey = (hash: string) => 'buo:v2:job-state:' + hash;
export const epochKey = 'buo:v2:job-epoch';
export function openingEpoch(store: Store) {
  if (!Object.hasOwn(store, epochKey)) return initialOpeningEpoch;
  const parsed = v.safeParse(openingEpochSchema, store[epochKey]);
  requireCondition(parsed.success, 'JOB_INTEGRITY_FAILED');
  return parsed.output.token;
}
async function plans(store: Store) {
  const results = [];
  for (const [key, raw] of Object.entries(store).filter(([key]) =>
    key.startsWith('buo:v2:job-gc:'),
  )) {
    const parsed = v.safeParse(jobGcSchema, raw);
    requireCondition(
      parsed.success &&
        (await digest(parsed.output)) === key.slice('buo:v2:job-gc:'.length),
      'JOB_INTEGRITY_FAILED',
    );
    results.push({ key, ...parsed.output });
  }
  return results;
}
export async function retiringJobs(store: Store) {
  return new Set(
    (await plans(store))
      .filter((plan) => plan.kind === 'retire')
      .flatMap((plan) => plan.jobs),
  );
}
export async function finishJobGc(io: JobMaintenanceIO) {
  if (!io.remove) return;
  const store = await io.read();
  const retiring = await retiringJobs(store);
  const protectedKeys = new Set<string>();
  for (const [key, raw] of Object.entries(store).filter(([key]) =>
    /^buo:v2:job:[a-f0-9]{64}$/.test(key),
  )) {
    const id = key.slice('buo:v2:job:'.length);
    if (retiring.has(id)) continue;
    const head = v.safeParse(jobHeadSchema, raw);
    requireCondition(
      head.success && head.output.id === id,
      'JOB_INTEGRITY_FAILED',
    );
    const current = v.safeParse(
      runSchema,
      store[jobStateKey(head.output.stateDigest)],
    );
    requireCondition(
      current.success &&
        (await digest(current.output)) === head.output.stateDigest &&
        current.output.id === id &&
        current.output.revision === head.output.revision,
      'JOB_INTEGRITY_FAILED',
    );
    const envelope = v.safeParse(
      planEnvelopeSchema,
      store['buo:v2:job-plan:' + id],
    );
    requireCondition(
      envelope.success &&
        envelope.output.digest === current.output.planDigest &&
        (await digest(
          envelope.output.schemaVersion === 2
            ? { schemaVersion: 2, plan: envelope.output.plan }
            : envelope.output.plan,
        )) === envelope.output.digest,
      'JOB_INTEGRITY_FAILED',
    );
    if (current.output.previousDigest) {
      const previous = v.safeParse(
        runSchema,
        store[jobStateKey(current.output.previousDigest)],
      );
      requireCondition(
        previous.success &&
          (await digest(previous.output)) === current.output.previousDigest &&
          previous.output.id === id &&
          previous.output.revision + 1 === current.output.revision,
        'JOB_INTEGRITY_FAILED',
      );
    }
    protectedKeys.add(jobStateKey(head.output.stateDigest));
    if (current.output.previousDigest)
      protectedKeys.add(jobStateKey(current.output.previousDigest));
  }
  for (const plan of await plans(store)) {
    let changed = false;
    for (const record of plan.records)
      if (
        Object.hasOwn(store, record.key) &&
        (await digest(store[record.key])) !== record.digest
      )
        changed = true;
    if (changed) continue;
    const removals = [];
    let pending = false;
    for (const record of plan.records) {
      if (!Object.hasOwn(store, record.key)) continue;
      if (
        (await digest(store[record.key])) !== record.digest ||
        protectedKeys.has(record.key) ||
        (plan.kind === 'progress' &&
          !record.key.startsWith('buo:v2:job-state:'))
      ) {
        pending = true;
        continue;
      }
      removals.push(record.key);
    }
    if (removals.length) await io.remove(removals);
    if (!pending) await io.remove([plan.key]);
  }
}
async function deletionPlan(
  io: JobMaintenanceIO,
  kind: 'progress' | 'retire',
  jobs: string[],
  keys: string[],
  archiveDigest: string | null = null,
) {
  const store = await io.read();
  const records = [];
  for (const key of [...new Set(keys)].sort())
    if (Object.hasOwn(store, key))
      records.push({ key, digest: await digest(store[key]) });
  if (!records.length) return;
  const plan = v.parse(jobGcSchema, {
    schemaVersion: 1,
    kind,
    jobs,
    records,
    archiveDigest,
  });
  if (kind === 'retire') {
    // Rotate the request scope *before* making old jobs unavailable. A cached
    // request from the expired scope can never reopen a forgotten batch.
    openingEpoch(store);
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    await io.write(epochKey, { schemaVersion: 1, token });
  }
  await io.append('buo:v2:job-gc:' + (await digest(plan)), plan);
  await finishJobGc(io);
}
export async function compactJobProgress(io: JobMaintenanceIO, id: string) {
  if (!io.remove) return;
  const store = await io.read();
  const envelope = v.safeParse(
    planEnvelopeSchema,
    store['buo:v2:job-plan:' + id],
  );
  if (!envelope.success || envelope.output.schemaVersion !== 2) return;
  const head = v.parse(jobHeadSchema, store['buo:v2:job:' + id]);
  const current = v.parse(runSchema, store[jobStateKey(head.stateDigest)]);
  const keys = [];
  for (const [key, raw] of Object.entries(store).filter(([key]) =>
    key.startsWith('buo:v2:job-state:'),
  )) {
    const old = v.safeParse(runSchema, raw);
    if (
      old.success &&
      old.output.id === id &&
      old.output.planDigest === current.planDigest &&
      old.output.revision <= current.revision &&
      key !== jobStateKey(head.stateDigest) &&
      key !== jobStateKey(current.previousDigest ?? '') &&
      (await digest(old.output)) === key.slice('buo:v2:job-state:'.length)
    )
      keys.push(key);
  }
  await deletionPlan(io, 'progress', [], keys);
}
function recordsForJob(store: Store, id: string) {
  return Object.keys(store).filter(
    (key) =>
      key === 'buo:v2:job:' + id ||
      key === 'buo:v2:job-plan:' + id ||
      key.startsWith('buo:v2:job-result:' + id + ':') ||
      (key.startsWith('buo:v2:job-state:') &&
        store[key] &&
        typeof store[key] === 'object' &&
        'id' in store[key] &&
        store[key].id === id),
  );
}
export async function retainCompletedJobs(
  io: JobMaintenanceIO,
  jobs: { plan: JobPlan; run: JobRun }[],
  verify: (id: string) => Promise<unknown>,
  archive?: { digest: string; store: Store },
) {
  if (!io.remove) return;
  const store = await io.read();
  const held = io.heldJobs ? await io.heldJobs().catch(() => null) : null;
  const candidates = [];
  // Unattributable damaged progress must not be silently orphaned by retirement.
  if (
    Object.entries(store).some(
      ([key, raw]) =>
        key.startsWith('buo:v2:job-state:') && !v.is(runSchema, raw),
    )
  )
    return;
  for (const job of jobs) {
    if (
      job.run.status !== 'completed' ||
      job.run.inFlight ||
      job.run.error !== null ||
      (job.plan.settings.loadOnFocus &&
        job.plan.destinations.length > 0 &&
        (held === null ||
          held.jobs.includes(job.plan.id) ||
          (held.unsettledTabs.length > 0 &&
            (held.sessionId === undefined ||
              held.sessionId !== job.run.windowSessionId)) ||
          job.plan.destinations.some((_, index) => {
            const receipt = v.safeParse(
              receiptEnvelopeSchema,
              store['buo:v2:job-result:' + job.plan.id + ':' + index],
            );
            return (
              !receipt.success ||
              (receipt.output.receipt.tabId !== null &&
                held.unsettledTabs.includes(receipt.output.receipt.tabId))
            );
          })))
    )
      continue;
    const envelope = v.safeParse(
      planEnvelopeSchema,
      store['buo:v2:job-plan:' + job.plan.id],
    );
    if (!envelope.success || (envelope.output.schemaVersion !== 2 && !archive))
      continue;
    const keys = recordsForJob(store, job.plan.id);
    try {
      await verify(job.plan.id);
      for (const key of keys) {
        if (archive)
          requireCondition(
            Object.hasOwn(archive.store, key) &&
              (await digest(archive.store[key])) === (await digest(store[key])),
            'ARCHIVE_SOURCES_CHANGED',
          );
        if (key.startsWith('buo:v2:job-state:'))
          requireCondition(
            (await digest(store[key])) ===
              key.slice('buo:v2:job-state:'.length),
            'JOB_INTEGRITY_FAILED',
          );
        if (key.startsWith('buo:v2:job-result:')) {
          const receipt = v.parse(receiptEnvelopeSchema, store[key]);
          requireCondition(
            (await digest(receipt.receipt)) === receipt.digest,
            'JOB_INTEGRITY_FAILED',
          );
        }
      }
      candidates.push({
        job,
        keys,
        bytes: keys.reduce(
          (total, key) => total + recordBytes(key, store[key]),
          0,
        ),
      });
    } catch {
      /* Keep damaged or changed records and their ownership context. */
    }
  }
  candidates.sort(
    (a, b) =>
      (b.job.run.completedAt ?? b.job.run.nextDueAt) -
        (a.job.run.completedAt ?? a.job.run.nextDueAt) ||
      b.job.plan.id.localeCompare(a.job.plan.id),
  );
  let kept = 0,
    bytes = 0;
  const remove = [];
  const ids = [];
  for (const item of candidates) {
    // Keep the latest finished result even if that result alone exceeds budget.
    const legacy =
      v.parse(planEnvelopeSchema, store['buo:v2:job-plan:' + item.job.plan.id])
        .schemaVersion !== 2;
    if (
      !legacy &&
      (kept === 0 ||
        (kept < completedJobLimit && bytes + item.bytes <= completedJobBytes))
    ) {
      kept++;
      bytes += item.bytes;
      continue;
    }
    ids.push(item.job.plan.id);
    remove.push(...item.keys);
  }
  await deletionPlan(io, 'retire', ids, remove, archive?.digest ?? null);
}
