import type { StorageCoordinator } from '../storage/coordinator';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import type { JobPlan, JobRun } from '../../domain/opening/schema';
import { destinationUrl } from '../../domain/opening/urls';
import { advanceReceipt } from './service';

export interface RunnerPort {
  now(): number;
  sessionId(): Promise<string>;
  sleep(milliseconds: number): Promise<void>;
  own(work: () => Promise<void>): Promise<void>;
  ensureAlarm(): Promise<void>;
  wake(milliseconds: number): void;
  idle(): Promise<void>;
  createTab(url: string, windowId: number | null): Promise<number>;
  activateTab(tabId: number): Promise<void>;
  deferredUrl(jobId: string, index: number): string;
}
type Work =
  | { kind: 'create'; job: { plan: JobPlan; run: JobRun }; url: string }
  | { kind: 'activate'; job: { plan: JobPlan; run: JobRun }; tabId: number }
  | { kind: 'wait'; until: number }
  | { kind: 'idle' };

export class OpeningRunner {
  private running: Promise<void> | null = null;
  private rerun = false;
  constructor(
    private readonly storage: StorageCoordinator,
    private readonly port: RunnerPort,
  ) {}
  kick(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    const work = this.port.own(async () => {
      await this.storage.requireActiveData();
      const needed = await this.storage.withJobs(async (journal) => {
        if (await journal.hasWork()) return true;
        await this.port.idle();
        return false;
      });
      if (!needed) return;
      try {
        await this.port.ensureAlarm();
      } catch (error) {
        const reason =
          error instanceof MigrationError &&
          error.code === 'DATA_CONSENT_REQUIRED'
            ? 'DATA_CONSENT_REQUIRED'
            : 'RECOVERY_ALARM_FAILED';
        await this.storage.withJobs(async (journal) => {
          for (const job of await journal.list())
            if (['queued', 'running'].includes(job.run.status))
              await journal.change(job.plan.id, job.run.revision, (run) => {
                run.status = 'paused';
                run.error = reason;
              });
        });
        return;
      }
      const deadline = this.port.now() + 10_000;
      const session = await this.port.sessionId();
      for (let steps = 0; steps < 25 && this.port.now() < deadline; steps++) {
        const next = await this.prepare(session);
        if (next.kind === 'idle') return;
        if (next.kind === 'wait') {
          const delay = Math.max(0, next.until - this.port.now());
          if (delay > 5000 || this.port.now() + delay >= deadline) {
            this.port.wake(delay);
            return;
          }
          await this.port.sleep(delay);
          continue;
        }
        await this.execute(next);
      }
      this.port.wake(0);
    });
    this.running = work.finally(() => {
      this.running = null;
      if (this.rerun) {
        this.rerun = false;
        this.port.wake(0);
      }
    });
    return this.running;
  }
  private prepare(session: string): Promise<Work> {
    return this.storage.withJobs(async (journal) => {
      await journal.recoverStaged();
      const jobs = await journal.list();
      for (const job of jobs) {
        const { plan, run } = job;
        const receipt =
          run.cursor < plan.destinations.length
            ? await journal.receipt(plan.id, run.cursor, run.planDigest)
            : null;
        if (receipt) {
          await advanceReceipt(journal, job, receipt, this.port.now());
          return { kind: 'wait', until: this.port.now() };
        }
        if (run.inFlight) {
          await journal.change(plan.id, run.revision, (next) => {
            next.error =
              run.inFlight?.kind === 'create'
                ? 'INTERRUPTED_CREATE'
                : 'INTERRUPTED_ACTIVATION';
            if (run.inFlight?.kind === 'activate')
              next.activation = 'uncertain';
            next.inFlight = null;
            if (next.status !== 'cancelled') next.status = 'needs-review';
          });
          return { kind: 'wait', until: this.port.now() };
        }
      }
      const runnable = jobs.filter((job) =>
        ['queued', 'running'].includes(job.run.status),
      );
      runnable.sort(
        (a, b) =>
          a.run.nextDueAt - b.run.nextDueAt ||
          a.plan.createdAt - b.plan.createdAt,
      );
      const job = runnable[0];
      if (!job) {
        await this.port.idle();
        return { kind: 'idle' };
      }
      const { plan, run } = job;
      if (run.windowSessionId !== session) {
        await journal.change(plan.id, run.revision, (next) => {
          next.status = 'paused';
          next.error = 'TARGET_WINDOW_CHANGED';
          next.windowId = null;
        });
        return { kind: 'wait', until: this.port.now() };
      }
      if (run.nextDueAt > this.port.now())
        return { kind: 'wait', until: run.nextDueAt };
      if (run.cursor === plan.destinations.length) {
        await journal.view(plan.id); // Verify all final receipts before reporting completion.
        if (run.activation === 'pending' && run.lastTabId !== null) {
          const next = await journal.change(plan.id, run.revision, (next) => {
            next.inFlight = { kind: 'activate', tabId: run.lastTabId! };
          });
          return {
            kind: 'activate',
            job: { plan, run: next },
            tabId: run.lastTabId,
          };
        }
        await journal.change(plan.id, run.revision, (next) => {
          next.status = 'completed';
          if (next.activation === 'pending') next.activation = 'not-required';
        });
        return { kind: 'wait', until: this.port.now() };
      }
      requireCondition(
        !(await journal.hasLaterReceipt(plan.id, run.cursor)),
        'JOB_INTEGRITY_FAILED',
      );
      const target = plan.destinations[run.cursor];
      requireCondition(
        target && 'url' in destinationUrl(target.url),
        'JOB_INTEGRITY_FAILED',
      );
      const next = await journal.change(plan.id, run.revision, (next) => {
        next.status = 'running';
        next.inFlight = { kind: 'create', index: run.cursor };
      });
      return {
        kind: 'create',
        job: { plan, run: next },
        url: plan.settings.loadOnFocus
          ? this.port.deferredUrl(plan.id, run.cursor)
          : target.url,
      };
    });
  }
  private async execute(
    work: Extract<Work, { kind: 'create' | 'activate' }>,
  ): Promise<void> {
    let tabId: number | null = null;
    let failed = false;
    try {
      if (work.kind === 'create')
        tabId = await this.port.createTab(work.url, work.job.run.windowId);
      else await this.port.activateTab(work.tabId);
    } catch {
      failed = true;
    }
    await this.storage.withJobs(async (journal) => {
      const job = await journal.get(work.job.plan.id);
      requireCondition(
        job && job.run.inFlight && job.run.cursor === work.job.run.cursor,
        'JOB_INTEGRITY_FAILED',
      );
      if (failed) {
        await journal.change(job.plan.id, job.run.revision, (run) => {
          run.inFlight = null;
          run.error =
            work.kind === 'create'
              ? 'TAB_CREATE_FAILED'
              : 'TAB_ACTIVATION_FAILED';
          if (work.kind === 'activate') run.activation = 'failed';
          if (run.status !== 'cancelled') run.status = 'needs-review';
        });
      } else if (work.kind === 'create') {
        requireCondition(tabId !== null, 'JOB_INTEGRITY_FAILED');
        await advanceReceipt(
          journal,
          job,
          {
            schemaVersion: 1,
            jobId: job.plan.id,
            index: job.run.cursor,
            planDigest: job.run.planDigest,
            kind: 'opened',
            tabId,
            recordedAt: this.port.now(),
          },
          this.port.now(),
        );
      } else {
        await journal.change(job.plan.id, job.run.revision, (run) => {
          run.inFlight = null;
          run.activation = 'done';
          run.error = null;
          if (run.status !== 'cancelled') run.status = 'completed';
        });
      }
    });
  }
}
