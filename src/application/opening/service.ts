import * as v from 'valibot';
import type { StorageCoordinator } from '../storage/coordinator';
import type { JobJournal } from '../storage/job-journal';
import { digest } from '../../domain/storage/json';
import { requireCondition } from '../../domain/storage/errors';
import {
  hashSchema,
  headSchema,
  listIdSchema,
} from '../../domain/storage/schema';
import { sameContent } from '../../domain/storage/migrate';
import { planOpening } from '../../domain/opening/urls';
import {
  controlSchema,
  targetWindowSchema,
  type JobControl,
  type JobPlan,
  type JobRun,
  type JobView,
  type TabReceipt,
} from '../../domain/opening/schema';

const common = {
  id: hashSchema,
  windowId: v.optional(targetWindowSchema, null),
  expectedHead: v.optional(v.nullable(headSchema), null),
};
export const openInputSchema = v.variant('kind', [
  v.strictObject({
    ...common,
    kind: v.literal('lines'),
    lines: v.array(v.string()),
  }),
  v.strictObject({
    ...common,
    kind: v.literal('list'),
    listId: listIdSchema,
    trigger: v.picklist(['saved-list', 'context-menu']),
  }),
  v.strictObject({ ...common, kind: v.literal('startup') }),
]);

export async function advanceReceipt(
  journal: JobJournal,
  job: { plan: JobPlan; run: JobRun },
  receipt: TabReceipt,
  now: number,
): Promise<JobRun> {
  requireCondition(receipt.index === job.run.cursor, 'JOB_INTEGRITY_FAILED');
  await journal.record(receipt);
  if (
    job.run.cursor + 1 === job.plan.destinations.length &&
    job.run.activation === 'not-required'
  )
    await journal.view(job.plan.id);
  return journal.change(job.plan.id, job.run.revision, (run) => {
    run.cursor++;
    run.inFlight = null;
    run.error = null;
    if (receipt.kind === 'opened') run.lastTabId = receipt.tabId;
    if (receipt.kind === 'assumed-opened') run.lastTabId = null;
    if (run.status === 'needs-review') run.status = 'paused';
    run.nextDueAt =
      run.cursor === job.plan.destinations.length
        ? now
        : now + job.plan.settings.tabCreationDelay * 1000;
    if (
      run.cursor === job.plan.destinations.length &&
      run.activation === 'not-required' &&
      run.status !== 'cancelled'
    )
      run.status = 'completed';
  });
}

export class OpeningService {
  constructor(
    readonly storage: StorageCoordinator,
    private readonly now: () => number = Date.now,
    private readonly session: () => Promise<string> = () =>
      Promise.resolve('0'.repeat(64)),
    private readonly prepareRecovery: () => Promise<void> = () =>
      Promise.resolve(),
  ) {}
  async enqueue(raw: unknown): Promise<JobView> {
    const request = v.parse(openInputSchema, raw);
    await this.storage.requireActiveData();
    await this.prepareRecovery();
    const browserSessionId = await this.session();
    return this.storage.withJobs(async (journal, active) => {
      const fingerprint = await digest(request);
      const staged = await journal.stagedPlan(request.id);
      if (staged) {
        requireCondition(
          staged.requestDigest === fingerprint,
          'OPERATION_ID_REUSED',
        );
        await journal.create(staged);
        return journal.view(request.id);
      }
      requireCondition(
        request.expectedHead === null ||
          sameContent(active.head, request.expectedHead),
        'REVISION_CONFLICT',
      );
      const sourceListId =
        request.kind === 'list'
          ? request.listId
          : request.kind === 'startup'
            ? active.data.settings.openOnLaunch
            : null;
      let lines: string[] = request.kind === 'lines' ? request.lines : [];
      if (sourceListId !== null) {
        const list = active.data.lists.find((list) => list.id === sourceListId);
        requireCondition(list, 'LIST_NOT_FOUND');
        lines = list.lines;
      }
      const createdAt = this.now();
      const wait = active.data.settings.tabCreationDelay * 1000;
      requireCondition(
        Number.isFinite(wait) && createdAt + wait <= Number.MAX_SAFE_INTEGER,
        'DELAY_OUT_OF_RANGE',
      );
      const plan: JobPlan = {
        schemaVersion: 1,
        id: request.id,
        requestDigest: fingerprint,
        origin: active.head,
        trigger:
          request.kind === 'lines'
            ? 'popup'
            : request.kind === 'startup'
              ? 'startup'
              : request.trigger,
        sourceListId,
        createdAt,
        windowId: request.windowId,
        browserSessionId,
        settings: structuredClone(active.data.settings),
        ...planOpening(lines, active.data.settings),
      };
      await journal.create(plan);
      return journal.view(plan.id);
    });
  }
  list(): Promise<JobView[]> {
    return this.storage.withJobs(async (journal) => {
      const jobs = await journal.list();
      const views = [];
      for (const job of jobs) views.push(await journal.view(job.plan.id));
      return views;
    });
  }
  get(id: string): Promise<JobView> {
    return this.storage.withJobs((journal) => journal.view(id));
  }
  async control(
    id: string,
    expectedRevision: number,
    raw: JobControl,
  ): Promise<JobView> {
    const control = v.parse(controlSchema, raw);
    const session = await this.session();
    return this.storage.withJobs(async (journal) => {
      let job = await journal.get(id);
      requireCondition(job, 'JOB_NOT_FOUND');
      const saved =
        job.run.cursor < job.plan.destinations.length
          ? await journal.receipt(id, job.run.cursor, job.run.planDigest)
          : null;
      if (saved) {
        job = {
          plan: job.plan,
          run: await advanceReceipt(journal, job, saved, this.now()),
        };
        if (control.action !== 'pause' && control.action !== 'cancel')
          return journal.view(id);
      }
      const { run, plan } = job;
      if (control.action === 'pause' || control.action === 'cancel') {
        if (
          !['completed', 'cancelled'].includes(run.status) &&
          (control.action === 'cancel' ||
            ['queued', 'running'].includes(run.status))
        )
          await journal.change(id, run.revision, (next) => {
            next.status = control.action === 'pause' ? 'paused' : 'cancelled';
          });
        return journal.view(id);
      }
      requireCondition(
        run.revision === expectedRevision,
        'JOB_REVISION_CONFLICT',
      );
      if (control.action === 'resume') {
        requireCondition(
          run.status === 'paused' &&
            (run.error === null ||
              run.error === 'RECOVERY_ALARM_FAILED' ||
              run.error === 'DATA_CONSENT_REQUIRED' ||
              run.error === 'TARGET_WINDOW_CHANGED'),
          'JOB_REVIEW_REQUIRED',
        );
        requireCondition(
          run.windowSessionId === session || control.windowId !== undefined,
          'TARGET_WINDOW_CHANGED',
        );
        requireCondition(
          control.windowId === undefined || run.inFlight === null,
          'JOB_IN_FLIGHT',
        );
        await journal.change(id, run.revision, (next) => {
          next.status = 'running';
          next.error = null;
          if (next.windowSessionId !== session) next.lastTabId = null;
          next.windowSessionId = session;
          next.nextDueAt = Math.max(this.now(), run.nextDueAt);
          if (control.windowId !== undefined) next.windowId = control.windowId;
        });
      } else if (
        control.action === 'retry-activation' ||
        control.action === 'finish'
      ) {
        requireCondition(
          run.status === 'needs-review' &&
            run.cursor === plan.destinations.length &&
            !run.inFlight,
          'JOB_REVIEW_REQUIRED',
        );
        await journal.change(id, run.revision, (next) => {
          next.error = null;
          next.activation =
            control.action === 'finish' ? 'not-required' : 'pending';
          next.status = control.action === 'finish' ? 'completed' : 'running';
        });
      } else {
        requireCondition(
          (run.status === 'needs-review' || run.status === 'cancelled') &&
            !run.inFlight &&
            run.error &&
            run.cursor < plan.destinations.length,
          'JOB_REVIEW_REQUIRED',
        );
        if (control.action === 'retry') {
          requireCondition(run.status !== 'cancelled', 'JOB_CANCELLED');
          requireCondition(
            run.windowSessionId === session || control.windowId !== undefined,
            'TARGET_WINDOW_CHANGED',
          );
          requireCondition(
            !(await journal.receipt(id, run.cursor, run.planDigest)),
            'JOB_INTEGRITY_FAILED',
          );
          await journal.change(id, run.revision, (next) => {
            next.status = 'running';
            next.error = null;
            next.nextDueAt = this.now();
            if (next.windowSessionId !== session) next.lastTabId = null;
            next.windowSessionId = session;
            if (control.windowId !== undefined)
              next.windowId = control.windowId;
          });
        } else {
          await advanceReceipt(
            journal,
            job,
            {
              schemaVersion: 1,
              jobId: id,
              index: run.cursor,
              planDigest: run.planDigest,
              kind: control.action === 'skip' ? 'skipped' : 'assumed-opened',
              tabId: null,
              recordedAt: this.now(),
            },
            this.now(),
          );
        }
      }
      return journal.view(id);
    });
  }
}
