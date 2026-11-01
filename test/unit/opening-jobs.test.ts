import { describe, expect, it, vi } from 'vitest';
import { OpeningRunner } from '../../src/application/opening/runner';
import { OpeningService } from '../../src/application/opening/service';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import { MigrationError } from '../../src/domain/storage/errors';
import { sharedSetup, token } from './shared-support';

describe('durable opening jobs', () => {
  it('does not establish a polling alarm for an idle migrated profile', async () => {
    const { runner, browser } = await sharedSetup();
    const ensure = vi.spyOn(browser, 'ensureAlarm');
    await runner.kick();
    expect(ensure).not.toHaveBeenCalled();
    expect(browser.idleClears).toBe(1);
  });
  it('orders idle cleanup and a concurrent enqueue without losing its durable signal', async () => {
    const { port, lock, browser } = await sharedSetup();
    let armed = false;
    const storage = new StorageCoordinator(port, lock, undefined, () => {
      armed = true;
      return Promise.resolve();
    });
    const opening = new OpeningService(storage, browser.now, browser.sessionId);
    const runner = new OpeningRunner(storage, browser);
    let entered!: () => void, finish!: () => void;
    const enteredIdle = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const finishIdle = new Promise<void>((resolve) => {
      finish = resolve;
    });
    browser.idle = async () => {
      entered();
      await finishIdle;
      armed = false;
    };
    const idle = runner.kick();
    await enteredIdle;
    const queued = opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://signal.example.test/'],
    });
    const coalesced = runner.kick();
    finish();
    await idle;
    await coalesced;
    await queued;
    expect(armed).toBe(true);
    expect(browser.wakes).toContain(0);
    browser.idle = () => {
      armed = false;
      return Promise.resolve();
    };
    await runner.kick();
    expect(browser.created).toHaveLength(1);
    expect(armed).toBe(false);
  });
  it('settles a recorded recovery decision after its progress acknowledgement is lost', async () => {
    const { storage, opening, runner, port, browser } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://uncertain.example.test/'],
    });
    await storage.withJobs((journal) =>
      journal.change(job.plan.id, job.run.revision, (run) => {
        run.status = 'running';
        run.inFlight = { kind: 'create', index: 0 };
      }),
    );
    await runner.kick();
    const uncertain = await opening.get(job.plan.id);
    port.failAt = port.writes.length + 3;
    await expect(
      opening.control(job.plan.id, uncertain.run.revision, {
        action: 'assume-opened',
      }),
    ).rejects.toThrow('STORAGE_WRITE_FAILED');
    port.failAt = 0;
    expect(
      (
        await opening.control(job.plan.id, uncertain.run.revision, {
          action: 'assume-opened',
        })
      ).run.status,
    ).toBe('completed');
    expect(browser.created).toEqual([]);
  });
  it('establishes recovery before publishing a plan and refuses an unmigrated store', async () => {
    const { storage, opening, port, browser } = await sharedSetup();
    const before = port.writes.length;
    const unavailable = new OpeningService(
      storage,
      browser.now,
      browser.sessionId,
      () => Promise.reject(new MigrationError('RECOVERY_ALARM_FAILED')),
    );
    await expect(
      unavailable.enqueue({
        kind: 'lines',
        id: token(10),
        lines: ['https://example.test/'],
      }),
    ).rejects.toThrow('RECOVERY_ALARM_FAILED');
    expect(port.writes).toHaveLength(before);
    expect(await opening.list()).toEqual([]);
    await storage.rollback((await storage.requireActiveData()).head);
    const prepare = vi.fn(() => Promise.resolve());
    const blocked = new OpeningService(
      storage,
      browser.now,
      browser.sessionId,
      prepare,
    );
    await expect(
      blocked.enqueue({
        kind: 'lines',
        id: token(11),
        lines: ['https://example.test/'],
      }),
    ).rejects.toThrow('MIGRATION_REQUIRED');
    expect(prepare).not.toHaveBeenCalled();
  });
  it('blocks damaged plans/receipts and refuses to reset a missing progressed job head', async () => {
    const { opening, runner, port, browser } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://once.example.test/'],
    });
    await runner.kick();
    const receiptKey = 'buo:v2:job-result:' + job.plan.id + ':0';
    const receipt = structuredClone(port.local[receiptKey]);
    port.local[receiptKey] = { digest: token(0) };
    await expect(opening.get(job.plan.id)).rejects.toThrow(
      'JOB_INTEGRITY_FAILED',
    );
    port.local[receiptKey] = receipt;
    delete port.local['buo:v2:job:' + job.plan.id];
    await expect(runner.kick()).rejects.toThrow('JOB_HEAD_MISSING');
    await expect(opening.list()).rejects.toThrow('JOB_HEAD_MISSING');
    expect(browser.created).toHaveLength(1);
  });
  it('records a plan before opening, spaces fractional delays, then activates the final tab once', async () => {
    const { storage, opening, browser, runner } = await sharedSetup();
    const active = await storage.requireActiveData();
    await storage.mutate({
      id: token(1),
      expectedHead: active.head,
      command: {
        kind: 'settings.update',
        patch: { tabCreationDelay: 0.125, newTabsActive: true },
      },
    });
    const start = browser.time;
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: [
        'https://one.example.test/',
        'https://two.example.test/',
        'https://three.example.test/',
      ],
      windowId: 4,
    });
    expect(browser.created).toEqual([]);
    expect(job.run.status).toBe('queued');
    await runner.kick();
    expect(browser.created.map((tab) => tab.time - start)).toEqual([
      0, 125, 250,
    ]);
    expect(browser.created.map((tab) => tab.windowId)).toEqual([4, 4, 4]);
    expect(browser.activated).toEqual([12]);
    const completed = await opening.get(job.plan.id);
    expect(completed.run).toMatchObject({
      status: 'completed',
      cursor: 3,
      activation: 'done',
    });
    expect(
      completed.receipts.every((receipt) => receipt?.kind === 'opened'),
    ).toBe(true);
    await runner.kick();
    expect(browser.created).toHaveLength(3);
    expect(browser.activated).toEqual([12]);
    expect((await storage.status()).canRollback).toBe(false);
  });
  it('takes one settings snapshot per job and keeps duplicate/reverse rules consistent', async () => {
    const { storage, opening, browser, runner } = await sharedSetup();
    await storage.mutate({
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: {
        kind: 'settings.update',
        patch: {
          automaticallyRemoveDuplicateUrls: true,
          openUrlsInReverseOrder: true,
          nonUrlHandler: 'ignoreString',
        },
      },
    });
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: [
        ' https://one.example.test ',
        'text',
        'https://one.example.test/',
        'https://two.example.test/',
      ],
    });
    await storage.mutate({
      id: token(2),
      expectedHead: (await storage.requireActiveData()).head,
      command: {
        kind: 'settings.update',
        patch: {
          openUrlsInReverseOrder: false,
          nonUrlHandler: 'searchForString',
        },
      },
    });
    await runner.kick();
    expect(browser.created.map((tab) => tab.url)).toEqual([
      'https://two.example.test/',
      'https://one.example.test/',
    ]);
    expect(job.plan.rejected.map((item) => item.reason)).toEqual([
      'ignored-text',
      'duplicate',
    ]);
  });
  it('is idempotent across a new service instance and rejects a reused job ID with a different request', async () => {
    const { storage, opening, browser, runner } = await sharedSetup();
    const request = {
      kind: 'lines',
      id: token(10),
      lines: ['https://once.example.test/'],
    };
    await opening.enqueue(request);
    await runner.kick();
    const restarted = new OpeningService(
      storage,
      browser.now,
      browser.sessionId,
    );
    expect((await restarted.enqueue(request)).run.status).toBe('completed');
    await expect(
      restarted.enqueue({
        ...request,
        lines: ['https://different.example.test/'],
      }),
    ).rejects.toThrow('OPERATION_ID_REUSED');
    expect(browser.created).toHaveLength(1);
  });
  it('completes empty or fully rejected batches without a tab or activation', async () => {
    const { opening, browser, runner } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['', 'javascript:alert(1)'],
    });
    await runner.kick();
    expect(job.run.status).toBe('completed');
    expect(job.plan.rejected).toHaveLength(2);
    expect(browser.created).toEqual([]);
    expect(browser.activated).toEqual([]);
  });
  it('pauses and cancels while allowing one already-started browser operation to finish', async () => {
    const { opening, browser, runner } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://one.example.test/', 'https://two.example.test/'],
    });
    let entered!: () => void, finish!: (id: number) => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    browser.createHook = () => {
      entered();
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    };
    const running = runner.kick();
    await started;
    await opening.control(job.plan.id, 1, { action: 'pause' });
    finish(40);
    await running;
    const paused = await opening.get(job.plan.id);
    expect(paused.run).toMatchObject({
      status: 'paused',
      cursor: 1,
      inFlight: null,
    });
    await opening.control(job.plan.id, paused.run.revision, {
      action: 'cancel',
    });
    browser.createHook = null;
    await runner.kick();
    expect((await opening.get(job.plan.id)).run.status).toBe('cancelled');
    expect((await opening.get(job.plan.id)).receipts[0]?.tabId).toBe(40);
    expect(browser.created).toHaveLength(0);
  });
  it('does not run before the due time and leaves long waits to a wake/alarm', async () => {
    const { storage, opening, browser, runner } = await sharedSetup();
    await storage.mutate({
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: { kind: 'settings.update', patch: { tabCreationDelay: 60 } },
    });
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://one.example.test/', 'https://two.example.test/'],
    });
    await runner.kick();
    expect(browser.created).toHaveLength(1);
    expect(browser.wakes.at(-1)).toBe(60_000);
    browser.time += 50_000;
    await runner.kick();
    expect(browser.created).toHaveLength(1);
    browser.time += 10_000;
    await runner.kick();
    expect(browser.created).toHaveLength(2);
    expect((await opening.get(job.plan.id)).run.status).toBe('completed');
  });
  it('requires review for an interrupted create instead of blindly replaying it', async () => {
    const { storage, opening, browser, runner } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://uncertain.example.test/'],
    });
    await storage.withJobs((journal) =>
      journal.change(job.plan.id, job.run.revision, (run) => {
        run.status = 'running';
        run.inFlight = { kind: 'create', index: 0 };
      }),
    );
    await runner.kick();
    const interrupted = await opening.get(job.plan.id);
    expect(interrupted.run).toMatchObject({
      status: 'needs-review',
      error: 'INTERRUPTED_CREATE',
      inFlight: null,
      cursor: 0,
    });
    expect(browser.created).toEqual([]);
    await expect(
      opening.control(job.plan.id, interrupted.run.revision, {
        action: 'resume',
      }),
    ).rejects.toThrow('JOB_REVIEW_REQUIRED');
    await opening.control(job.plan.id, interrupted.run.revision, {
      action: 'assume-opened',
    });
    expect((await opening.get(job.plan.id)).run.status).toBe('completed');
    expect(browser.created).toEqual([]);
  });
  for (const failure of ['before', 'after', 'drop'] as const) {
    it.each([3, 4, 5])(
      'recovers tab acknowledgement write %i with a ' + failure + ' failure',
      async (offset) => {
        const { storage, port, lock, opening, browser, runner } =
          await sharedSetup();
        const job = await opening.enqueue({
          kind: 'lines',
          id: token(10),
          lines: ['https://once.example.test/'],
        });
        port.failAt = port.writes.length + offset;
        port.failure = failure;
        await expect(runner.kick()).rejects.toThrow(
          /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
        );
        expect(browser.created).toHaveLength(1);
        port.failAt = 0;
        const restarted = new StorageCoordinator(port, lock);
        const resumed = new OpeningRunner(restarted, browser);
        await resumed.kick();
        const result = await new OpeningService(
          restarted,
          browser.now,
          browser.sessionId,
        ).get(job.plan.id);
        const receiptLost = offset === 3 && failure !== 'after';
        expect(result.run.status).toBe(
          receiptLost ? 'needs-review' : 'completed',
        );
        expect(browser.created).toHaveLength(1);
        expect((await storage.requireActiveData()).data.lists).toEqual([]);
      },
    );
  }
  it.each([1, 2, 3])(
    'recovers an unpublished initial job after queue write %i fails',
    async (offset) => {
      const { port, opening, browser, runner } = await sharedSetup();
      port.failAt = port.writes.length + offset;
      await expect(
        opening.enqueue({
          kind: 'lines',
          id: token(10),
          lines: ['https://queued.example.test/'],
        }),
      ).rejects.toThrow('STORAGE_WRITE_FAILED');
      port.failAt = 0;
      await runner.kick();
      // If the plan write never happened there is no durable opening intent yet.
      expect(browser.created).toHaveLength(offset === 1 ? 0 : 1);
    },
  );
  it('stops on browser failure and retries only after an explicit decision', async () => {
    const { opening, browser, runner } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['file:///tmp/example.txt'],
    });
    browser.createHook = () =>
      Promise.reject(new Error('restricted destination'));
    await runner.kick();
    let current = await opening.get(job.plan.id);
    expect(current.run).toMatchObject({
      status: 'needs-review',
      error: 'TAB_CREATE_FAILED',
    });
    await runner.kick();
    expect(browser.created).toEqual([]);
    browser.createHook = null;
    await opening.control(job.plan.id, current.run.revision, {
      action: 'retry',
    });
    await runner.kick();
    current = await opening.get(job.plan.id);
    expect(current.run.status).toBe('completed');
    expect(browser.created).toHaveLength(1);
  });
  it('records activation failures separately without reopening completed destinations', async () => {
    const { storage, opening, browser, runner } = await sharedSetup();
    await storage.mutate({
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: { kind: 'settings.update', patch: { newTabsActive: true } },
    });
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://one.example.test/'],
    });
    vi.spyOn(browser, 'activateTab').mockRejectedValueOnce(
      new Error('closed tab'),
    );
    await runner.kick();
    const failed = await opening.get(job.plan.id);
    expect(failed.run).toMatchObject({
      status: 'needs-review',
      error: 'TAB_ACTIVATION_FAILED',
      cursor: 1,
    });
    await opening.control(job.plan.id, failed.run.revision, {
      action: 'finish',
    });
    await runner.kick();
    expect(browser.created).toHaveLength(1);
  });
  it('pauses old-session jobs and requires an explicit target rather than reusing window IDs', async () => {
    const { opening, browser, runner } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://new-session.example.test/'],
      windowId: 5,
    });
    browser.session = token(1000);
    await runner.kick();
    const paused = await opening.get(job.plan.id);
    expect(paused.run).toMatchObject({
      status: 'paused',
      error: 'TARGET_WINDOW_CHANGED',
      windowId: null,
    });
    expect(browser.created).toEqual([]);
    await expect(
      opening.control(job.plan.id, paused.run.revision, { action: 'resume' }),
    ).rejects.toThrow('TARGET_WINDOW_CHANGED');
    await opening.control(job.plan.id, paused.run.revision, {
      action: 'resume',
      windowId: 9,
    });
    await runner.kick();
    expect(browser.created[0]?.windowId).toBe(9);
  });
  it('serializes two runner instances through one ownership lock', async () => {
    const { storage, opening, browser, runner } = await sharedSetup();
    await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://one.example.test/', 'https://two.example.test/'],
    });
    await Promise.all([
      runner.kick(),
      new OpeningRunner(storage, browser).kick(),
    ]);
    expect(browser.created).toHaveLength(2);
  });
  it('fails closed if alarms/consent are unavailable and permits a controlled retry', async () => {
    const { opening, browser, runner } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://one.example.test/'],
    });
    browser.alarmFailure = true;
    await runner.kick();
    let paused = await opening.get(job.plan.id);
    expect(paused.run.error).toBe('RECOVERY_ALARM_FAILED');
    expect(browser.created).toEqual([]);
    browser.alarmFailure = false;
    await opening.control(job.plan.id, paused.run.revision, {
      action: 'resume',
    });
    vi.spyOn(browser, 'ensureAlarm').mockRejectedValueOnce(
      new MigrationError('DATA_CONSENT_REQUIRED'),
    );
    await runner.kick();
    paused = await opening.get(job.plan.id);
    expect(paused.run.error).toBe('DATA_CONSENT_REQUIRED');
    expect(browser.created).toEqual([]);
    await opening.control(job.plan.id, paused.run.revision, {
      action: 'resume',
    });
    await runner.kick();
    expect(browser.created).toHaveLength(1);
  });
  it('keeps per-step snapshots small instead of copying the URL plan into every progress record', async () => {
    const { port, opening, browser, runner } = await sharedSetup();
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: Array.from(
        { length: 50 },
        (_, index) => 'https://scale.example.test/' + String(index),
      ),
    });
    for (
      let count = 0;
      count < 5 && (await opening.get(job.plan.id)).run.status !== 'completed';
      count++
    )
      await runner.kick();
    expect(browser.created).toHaveLength(50);
    const snapshots = Object.entries(port.local).filter(([key]) =>
      key.startsWith('buo:v2:job-state:'),
    );
    expect(snapshots.length).toBeGreaterThan(50);
    for (const [, state] of snapshots) {
      const serialized = JSON.stringify(state);
      expect(serialized).not.toContain('https://scale.example.test/');
      expect(serialized.length).toBeLessThan(1500);
    }
  });
});
