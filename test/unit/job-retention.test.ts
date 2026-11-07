import {
  StartupOpening,
  type StartupRecord,
} from '../../src/application/opening/startup';
import { digest } from '../../src/domain/storage/json';
import { describe, expect, it } from 'vitest';
import { sharedSetup, token } from './shared-support';
import { recordBytes } from '../../src/application/storage/checkpoints';
import { initialOpeningEpoch } from '../../src/domain/opening/history';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import { OpeningService } from '../../src/application/opening/service';
import { mutex } from './storage-support';
const bytes = (store: Record<string, unknown>) =>
  Object.entries(store).reduce(
    (total, [key, raw]) => total + recordBytes(key, raw),
    0,
  );
type Context = Awaited<ReturnType<typeof sharedSetup>>;
async function finish(
  c: Context,
  id: number,
  lines = ['https://example.test/one', 'https://example.test/two'],
) {
  const input = {
    kind: 'lines' as const,
    id: token(id),
    epoch: await c.storage.openingEpoch(),
    windowId: 1,
    lines,
  };
  const job = await c.opening.enqueue(input);
  for (let i = 0; i < 20; i++) {
    await c.runner.kick();
    if ((await c.opening.get(job.plan.id)).run.status === 'completed')
      return input;
  }
  throw new Error('SYNTHETIC_JOB_DID_NOT_FINISH');
}
describe('bounded completed opening jobs', () => {
  it('bounds finished jobs, intermediate states and bytes across 100 batches; expired requests cannot reopen tabs', async () => {
    const c = await sharedSetup();
    const first = await finish(c, 1);
    let warm = 0;
    for (let id = 2; id <= 100; id++) {
      await finish(c, id);
      if (id === 30) warm = bytes(c.port.local);
    }
    expect(await c.opening.list()).toHaveLength(10);
    expect(
      Object.keys(c.port.local).filter((key) =>
        key.startsWith('buo:v2:job-state:'),
      ).length,
    ).toBeLessThanOrEqual(20);
    expect(bytes(c.port.local)).toBeLessThan(warm + 4096);
    const created = c.browser.created.length;
    await expect(c.opening.enqueue(first)).rejects.toThrow(
      'OPEN_REQUEST_EXPIRED',
    );
    expect(c.browser.created).toHaveLength(created);
    const last = await c.opening.list();
    const job = last.at(-1)!;
    expect((await c.opening.get(job.plan.id)).run.status).toBe('completed');
    const restarted = new OpeningService(
      new StorageCoordinator(c.port, mutex()),
      c.browser.now,
      c.browser.sessionId,
    );
    await expect(restarted.enqueue(first)).rejects.toThrow(
      'OPEN_REQUEST_EXPIRED',
    );
  }, 60_000);
  it('protects a completed holding-tab job until the live tab query confirms its helpers are gone', async () => {
    const c = await sharedSetup();
    await c.storage.mutate({
      id: token(900),
      expectedHead: (await c.storage.requireActiveData()).head,
      command: { kind: 'settings.update', patch: { loadOnFocus: true } },
    });
    await finish(c, 1);
    await c.storage.mutate({
      id: token(901),
      expectedHead: (await c.storage.requireActiveData()).head,
      command: { kind: 'settings.update', patch: { loadOnFocus: false } },
    });
    for (let id = 2; id <= 14; id++) await finish(c, id);
    expect((await c.opening.get(token(1))).run.status).toBe('completed');
    c.port.heldJobs = () =>
      Promise.resolve({ jobs: [token(1)], unsettledTabs: [] });
    await c.storage.withJobs((journal) => journal.maintain());
    expect((await c.opening.get(token(1))).run.status).toBe('completed');
    c.port.heldJobs = () => Promise.resolve({ jobs: [], unsettledTabs: [] });
    await c.storage.withJobs((journal) => journal.maintain());
    await expect(c.opening.get(token(1))).rejects.toThrow('JOB_NOT_FOUND');
  });
  it('retains legacy finished history until an exact full recovery archive is explicitly verified', async () => {
    const c = await sharedSetup();
    const pending = await c.opening.enqueue({
      kind: 'lines',
      id: token(1),
      lines: ['https://example.test/legacy'],
    });
    for (const [key, raw] of Object.entries(c.port.local))
      if (
        key === 'buo:v2:job:' + token(1) ||
        (key.startsWith('buo:v2:job-state:') &&
          raw &&
          typeof raw === 'object' &&
          'id' in raw &&
          raw.id === token(1))
      )
        delete c.port.local[key];
    c.port.local['buo:v2:job-plan:' + token(1)] = {
      digest: await digest(pending.plan),
      plan: pending.plan,
    };
    await c.storage.withJobs(async (journal) => {
      await journal.create(pending.plan);
    });
    await c.runner.kick();
    for (let id = 2; id <= 14; id++) await finish(c, id);
    expect((await c.opening.get(token(1))).run.status).toBe('completed');
    const archive = await c.storage.exportArchive({});
    await c.storage.compactArchive({}, archive);
    await expect(c.opening.get(token(1))).rejects.toThrow('JOB_NOT_FOUND');
  });
  it('keeps paused, cancelled and unconfirmed jobs while old finished batches expire', async () => {
    const c = await sharedSetup();
    for (const [id, action] of [
      [1, 'pause'],
      [2, 'cancel'],
    ] as const) {
      const job = await c.opening.enqueue({
        kind: 'lines',
        id: token(id),
        lines: ['https://example.test/pending'],
      });
      await c.opening.control(job.plan.id, job.run.revision, { action });
    }
    c.browser.createHook = () => Promise.reject(new Error('synthetic failure'));
    const uncertain = await c.opening.enqueue({
      kind: 'lines',
      id: token(3),
      lines: ['https://example.test/unconfirmed'],
    });
    await c.runner.kick();
    expect((await c.opening.get(uncertain.plan.id)).run.status).toBe(
      'needs-review',
    );
    c.browser.createHook = null;
    for (let id = 10; id < 25; id++) await finish(c, id);
    expect((await c.opening.get(token(1))).run.status).toBe('paused');
    expect((await c.opening.get(token(2))).run.status).toBe('cancelled');
    expect((await c.opening.get(token(3))).run.status).toBe('needs-review');
  });
  it('does not reopen an expired batch after a partially completed deletion', async () => {
    const c = await sharedSetup();
    const first = await finish(c, 1);
    for (let id = 2; id <= 10; id++) await finish(c, id);
    const original = c.port.removeLocal.bind(c.port);
    let interrupted = false;
    c.port.removeLocal = async (keys) => {
      if (keys.some((key) => key === 'buo:v2:job:' + token(1))) {
        await original(keys.slice(0, 1));
        interrupted = true;
        throw new Error('interrupted cleanup');
      }
      await original(keys);
    };
    await finish(c, 11);
    expect(interrupted).toBe(true);
    await expect(c.opening.enqueue(first)).rejects.toThrow(
      'OPEN_REQUEST_EXPIRED',
    );
    c.port.removeLocal = original;
    await c.storage.withJobs((journal) => journal.maintain());
    expect(await c.opening.list()).toHaveLength(10);
    expect(
      Object.keys(c.port.local).some((key) => key.startsWith('buo:v2:job-gc:')),
    ).toBe(false);
  });
  it('applies the size budget while preserving the newest completed result', async () => {
    const c = await sharedSetup();
    await finish(c, 1, ['javascript:' + 'x'.repeat(1100 * 1024)]);
    expect((await c.opening.get(token(1))).run.status).toBe('completed');
    await finish(c, 2, []);
    await expect(c.opening.get(token(1))).rejects.toThrow('JOB_NOT_FOUND');
    expect(await c.storage.openingEpoch()).not.toBe(initialOpeningEpoch);
  });
});

it('protects holding tabs that still have an unsettled about:blank navigation', async () => {
  const c = await sharedSetup();
  await c.storage.mutate({
    id: token(900),
    expectedHead: (await c.storage.requireActiveData()).head,
    command: { kind: 'settings.update', patch: { loadOnFocus: true } },
  });
  await finish(c, 1);
  const held = await c.opening.get(token(1));
  c.port.heldJobs = () =>
    Promise.resolve({ jobs: [], unsettledTabs: [held.receipts[0]!.tabId!] });
  await c.storage.mutate({
    id: token(901),
    expectedHead: (await c.storage.requireActiveData()).head,
    command: { kind: 'settings.update', patch: { loadOnFocus: false } },
  });
  for (let id = 2; id <= 13; id++) await finish(c, id);
  expect((await c.opening.get(token(1))).run.status).toBe('completed');
});

it('reads a whole job view from one storage snapshot instead of cloning storage once per receipt', async () => {
  const c = await sharedSetup();
  await finish(
    c,
    1,
    Array.from({ length: 50 }, (_, i) => 'https://example.test/' + i),
  );
  let reads = 0;
  const original = c.port.readLocal.bind(c.port);
  c.port.readLocal = () => {
    reads++;
    return original();
  };
  await c.opening.get(token(1));
  expect(reads).toBeLessThan(8);
});

it('does not repeat startup opening when its done acknowledgement was lost and its finished job later expires', async () => {
  const c = await sharedSetup();
  const list = await c.storage.mutate({
    id: token(900),
    expectedHead: (await c.storage.requireActiveData()).head,
    command: {
      kind: 'list.create',
      name: 'Startup example',
      lines: ['https://example.test/startup'],
    },
  });
  await c.storage.mutate({
    id: token(901),
    expectedHead: list.head!,
    command: {
      kind: 'settings.update',
      patch: { openOnLaunch: list.data!.lists[0]!.id },
    },
  });
  let saved: StartupRecord | undefined;
  let fail = true;
  const startup = new StartupOpening(c.storage, c.opening, {
    exclusive: mutex(),
    read: () => Promise.resolve(saved),
    write: (record) => {
      if (record.status === 'done' && fail) {
        fail = false;
        return Promise.reject(new Error('lost done acknowledgement'));
      }
      saved = structuredClone(record);
      return Promise.resolve();
    },
    token: () => token(1),
    normalWindow: () => Promise.resolve(1),
  });
  await expect(startup.event()).rejects.toThrow('lost done acknowledgement');
  await c.runner.kick();
  for (let id = 2; id <= 14; id++) await finish(c, id);
  const before = c.browser.created.length;
  await startup.recover();
  await c.runner.kick();
  expect(c.browser.created).toHaveLength(before);
  expect(saved?.outcome).toBe('OPEN_REQUEST_EXPIRED');
});

it('protects older holding jobs while restored tabs have unsettled IDs from another browser session', async () => {
  const c = await sharedSetup();
  await c.storage.mutate({
    id: token(900),
    expectedHead: (await c.storage.requireActiveData()).head,
    command: { kind: 'settings.update', patch: { loadOnFocus: true } },
  });
  await finish(c, 1);
  c.port.heldJobs = () =>
    Promise.resolve({
      jobs: [],
      unsettledTabs: [987654],
      sessionId: token(888),
    });
  await c.storage.mutate({
    id: token(901),
    expectedHead: (await c.storage.requireActiveData()).head,
    command: { kind: 'settings.update', patch: { loadOnFocus: false } },
  });
  for (let id = 2; id <= 13; id++) await finish(c, id);
  expect((await c.opening.get(token(1))).run.status).toBe('completed');
});

it('does not retain empty finished batches indefinitely when live-tab discovery is unavailable', async () => {
  const c = await sharedSetup();
  await c.storage.mutate({
    id: token(900),
    expectedHead: (await c.storage.requireActiveData()).head,
    command: { kind: 'settings.update', patch: { loadOnFocus: true } },
  });
  for (let id = 1; id <= 14; id++) await finish(c, id, []);
  expect(await c.opening.list()).toHaveLength(10);
});
