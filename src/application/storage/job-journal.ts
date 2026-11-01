import * as v from 'valibot';
import { digest } from '../../domain/storage/json';
import { requireCondition } from '../../domain/storage/errors';
import { storagePrefix } from '../../domain/storage/schema';
import {
  jobHeadSchema,
  jobPlanSchema,
  planEnvelopeSchema,
  receiptEnvelopeSchema,
  receiptSchema,
  runSchema,
  type JobPlan,
  type JobRun,
  type JobView,
  type TabReceipt,
} from '../../domain/opening/schema';
import { sameContent } from '../../domain/storage/migrate';

export type JournalIO = {
  signal(): Promise<void>;
  read(): Promise<Record<string, unknown>>;
  append(key: string, value: unknown): Promise<void>;
  write(key: string, value: unknown): Promise<void>;
};
const planKey = (id: string) => storagePrefix + 'job-plan:' + id;
const jobKey = (id: string) => storagePrefix + 'job:' + id;
const stateKey = (hash: string) => storagePrefix + 'job-state:' + hash;
const resultKey = (id: string, index: number) =>
  storagePrefix + 'job-result:' + id + ':' + String(index);
function parsed<T>(schema: v.GenericSchema<T>, value: unknown): T {
  const result = v.safeParse(schema, value);
  requireCondition(result.success, 'JOB_INTEGRITY_FAILED');
  return result.output;
}

// Only construct this journal inside StorageCoordinator.withJobs: all methods
// share the canonical writer lock. Plans/receipts are immutable, run snapshots
// are small, and their mutable pointer is always published last.
export class JobJournal {
  constructor(private readonly io: JournalIO) {}
  private async planAt(id: string, store: Record<string, unknown>) {
    if (!Object.hasOwn(store, planKey(id))) return null;
    const envelope = parsed(planEnvelopeSchema, store[planKey(id)]);
    requireCondition(
      envelope.plan.id === id &&
        (await digest(envelope.plan)) === envelope.digest,
      'JOB_INTEGRITY_FAILED',
    );
    return envelope;
  }
  async stagedPlan(id: string): Promise<JobPlan | null> {
    return (await this.planAt(id, await this.io.read()))?.plan ?? null;
  }
  async get(id: string): Promise<{ plan: JobPlan; run: JobRun } | null> {
    const store = await this.io.read();
    if (!Object.hasOwn(store, jobKey(id))) return null;
    const head = parsed(jobHeadSchema, store[jobKey(id)]);
    const envelope = await this.planAt(id, store);
    requireCondition(envelope && head.id === id, 'JOB_INTEGRITY_FAILED');
    const run = parsed(runSchema, store[stateKey(head.stateDigest)]);
    requireCondition(
      (await digest(run)) === head.stateDigest &&
        run.id === id &&
        run.revision === head.revision &&
        run.planDigest === envelope.digest,
      'JOB_INTEGRITY_FAILED',
    );
    const count = envelope.plan.destinations.length;
    requireCondition(
      run.cursor <= count &&
        (!run.inFlight ||
          (run.inFlight.kind === 'create'
            ? run.inFlight.index === run.cursor && run.cursor < count
            : run.inFlight.tabId === run.lastTabId)),
      'JOB_INTEGRITY_FAILED',
    );
    requireCondition(
      run.status !== 'completed' ||
        (run.cursor === count &&
          !run.inFlight &&
          ['done', 'not-required'].includes(run.activation)),
      'JOB_INTEGRITY_FAILED',
    );
    if (run.previousDigest) {
      const previous = parsed(runSchema, store[stateKey(run.previousDigest)]);
      requireCondition(
        (await digest(previous)) === run.previousDigest &&
          previous.id === id &&
          previous.planDigest === run.planDigest &&
          previous.revision + 1 === run.revision &&
          previous.cursor <= run.cursor &&
          run.cursor <= previous.cursor + 1,
        'JOB_INTEGRITY_FAILED',
      );
    } else
      requireCondition(
        run.revision === 1 && run.cursor === 0,
        'JOB_INTEGRITY_FAILED',
      );
    if (run.cursor)
      requireCondition(
        await this.receipt(id, run.cursor - 1, run.planDigest),
        'JOB_INTEGRITY_FAILED',
      );
    return { plan: envelope.plan, run };
  }
  async list(): Promise<{ plan: JobPlan; run: JobRun }[]> {
    const store = await this.io.read();
    for (const key of Object.keys(store).filter((key) =>
      key.startsWith(storagePrefix + 'job-plan:'),
    ))
      requireCondition(
        Object.hasOwn(
          store,
          jobKey(key.slice((storagePrefix + 'job-plan:').length)),
        ),
        'JOB_HEAD_MISSING',
      );
    const values = [];
    for (const key of Object.keys(store)
      .filter((key) => key.startsWith(storagePrefix + 'job:'))
      .sort()) {
      const value = await this.get(key.slice((storagePrefix + 'job:').length));
      requireCondition(value, 'JOB_INTEGRITY_FAILED');
      values.push(value);
    }
    return values.sort(
      (a, b) =>
        a.plan.createdAt - b.plan.createdAt ||
        a.plan.id.localeCompare(b.plan.id),
    );
  }
  async recoverStaged(): Promise<void> {
    const store = await this.io.read();
    for (const key of Object.keys(store).filter((key) =>
      key.startsWith(storagePrefix + 'job-plan:'),
    )) {
      const id = key.slice((storagePrefix + 'job-plan:').length);
      if (!Object.hasOwn(store, jobKey(id))) {
        const staged = await this.stagedPlan(id);
        requireCondition(staged, 'JOB_INTEGRITY_FAILED');
        await this.create(staged);
      }
    }
  }
  async hasWork(): Promise<boolean> {
    const store = await this.io.read();
    if (
      Object.keys(store).some(
        (key) =>
          key.startsWith(storagePrefix + 'job-plan:') &&
          !Object.hasOwn(
            store,
            jobKey(key.slice((storagePrefix + 'job-plan:').length)),
          ),
      )
    )
      return true;
    for (const job of await this.list()) {
      if (['queued', 'running'].includes(job.run.status) || job.run.inFlight)
        return true;
      if (
        job.run.cursor < job.plan.destinations.length &&
        (await this.receipt(job.plan.id, job.run.cursor, job.run.planDigest))
      )
        return true;
    }
    return false;
  }
  async create(raw: JobPlan): Promise<{ plan: JobPlan; run: JobRun }> {
    const plan = parsed(jobPlanSchema, raw);
    const staged = await this.stagedPlan(plan.id);
    if (staged)
      requireCondition(sameContent(staged, plan), 'OPERATION_ID_REUSED');
    const current = await this.get(plan.id);
    if (current) return current;
    await this.io.signal();
    if (!staged)
      await this.io.append(planKey(plan.id), {
        digest: await digest(plan),
        plan,
      });
    const run: JobRun = {
      schemaVersion: 1,
      id: plan.id,
      revision: 1,
      previousDigest: null,
      planDigest: await digest(plan),
      status: plan.destinations.length ? 'queued' : 'completed',
      cursor: 0,
      nextDueAt: plan.createdAt,
      windowId: plan.windowId,
      windowSessionId: plan.browserSessionId,
      inFlight: null,
      error: null,
      activation:
        plan.destinations.length &&
        plan.settings.newTabsActive &&
        !plan.settings.loadOnFocus
          ? 'pending'
          : 'not-required',
      lastTabId: null,
    };
    const hash = await digest(run);
    for (const [key, value] of Object.entries(await this.io.read()).filter(
      ([key]) => key.startsWith(storagePrefix + 'job-state:'),
    )) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        value.id === plan.id
      )
        requireCondition(
          key === stateKey(hash) && sameContent(value, run),
          'JOB_HEAD_MISSING',
        );
    }
    await this.io.append(stateKey(hash), run);
    await this.io.write(jobKey(plan.id), {
      schemaVersion: 1,
      id: plan.id,
      revision: 1,
      stateDigest: hash,
    });
    const result = await this.get(plan.id);
    requireCondition(result, 'JOB_INTEGRITY_FAILED');
    return result;
  }
  async change(
    id: string,
    expectedRevision: number,
    change: (run: JobRun) => void,
  ): Promise<JobRun> {
    const current = await this.get(id);
    requireCondition(
      current && current.run.revision === expectedRevision,
      'JOB_REVISION_CONFLICT',
    );
    const run = structuredClone(current.run);
    change(run);
    run.revision++;
    run.previousDigest = await digest(current.run);
    requireCondition(
      run.id === id && run.planDigest === current.run.planDigest,
      'JOB_INTEGRITY_FAILED',
    );
    const next = parsed(runSchema, run);
    const hash = await digest(next);
    try {
      await this.io.signal();
    } catch (error) {
      if (['queued', 'running'].includes(next.status)) throw error;
    }
    await this.io.append(stateKey(hash), next);
    await this.io.write(jobKey(id), {
      schemaVersion: 1,
      id,
      revision: next.revision,
      stateDigest: hash,
    });
    const result = await this.get(id);
    requireCondition(result, 'JOB_INTEGRITY_FAILED');
    return result.run;
  }
  async receipt(
    id: string,
    index: number,
    planDigest: string,
  ): Promise<TabReceipt | null> {
    const store = await this.io.read();
    const key = resultKey(id, index);
    if (!Object.hasOwn(store, key)) return null;
    const envelope = parsed(receiptEnvelopeSchema, store[key]);
    const receipt = envelope.receipt;
    requireCondition(
      (await digest(receipt)) === envelope.digest &&
        receipt.jobId === id &&
        receipt.index === index &&
        receipt.planDigest === planDigest,
      'JOB_INTEGRITY_FAILED',
    );
    return receipt;
  }
  async record(receipt: TabReceipt): Promise<void> {
    const parsedReceipt = parsed(receiptSchema, receipt);
    await this.io.append(resultKey(receipt.jobId, receipt.index), {
      digest: await digest(parsedReceipt),
      receipt: parsedReceipt,
    });
  }
  async hasLaterReceipt(id: string, cursor: number): Promise<boolean> {
    const prefix = storagePrefix + 'job-result:' + id + ':';
    return Object.keys(await this.io.read()).some(
      (key) =>
        key.startsWith(prefix) && Number(key.slice(prefix.length)) > cursor,
    );
  }
  async view(id: string): Promise<JobView> {
    const job = await this.get(id);
    requireCondition(job, 'JOB_NOT_FOUND');
    const receipts = [];
    for (let index = 0; index < job.plan.destinations.length; index++) {
      const receipt = await this.receipt(id, index, job.run.planDigest);
      requireCondition(
        index >= job.run.cursor || receipt,
        'JOB_INTEGRITY_FAILED',
      );
      receipts.push(receipt);
    }
    return { ...job, receipts };
  }
}
