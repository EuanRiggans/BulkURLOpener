import { describe, expect, it, vi } from 'vitest';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import { analyzeSources } from '../../src/domain/storage/migrate';
import { headKey, storagePrefix } from '../../src/domain/storage/schema';
import {
  empty,
  MemoryStorage,
  mutex,
  profile,
  reviewed,
} from './storage-support';

const clock = () => '2026-11-01T12:00:00.000Z';
function setup(name = 'current-profile') {
  const source = profile(name);
  const port = new MemoryStorage(source);
  const lock = mutex();
  const service = new StorageCoordinator(port, lock, clock);
  return { source, port, lock, service };
}
async function activate(
  service: StorageCoordinator,
  document: Record<string, string>,
) {
  const review = await service.prepare(document);
  const decisions = reviewed(review.plan);
  const status = await service.commit(document, review, decisions);
  return { review, decisions, status };
}

describe('recoverable storage protocol', () => {
  it('makes no writes on construction, status or a refused active-data read', async () => {
    const { service, port } = setup();
    expect((await service.status()).status).toBe('uninitialized');
    await expect(service.requireActiveData()).rejects.toThrow(
      'MIGRATION_REQUIRED',
    );
    expect(port.writes).toEqual([]);
  });
  it.each([
    'current-profile',
    'numeric-profile',
    'pre-json-profile',
    'pre-marker-profile',
    'conflicting-mirrors',
    'mirror-only-profile',
    'damaged-profile',
  ])(
    'backs up exact raw source bytes and verifies the active store: %s',
    async (name) => {
      const { source, port, service } = setup(name);
      const original = structuredClone(source);
      const { review, status } = await activate(service, source.localStorage);
      expect(status.status).toBe('ready');
      expect((await service.backup(review.backupDigest)).sources).toEqual(
        original,
      );
      expect((await service.requireActiveData()).data).toEqual(status.data);
      expect(source).toEqual(original);
      for (const [key, value] of Object.entries(original.storageLocal))
        expect(port.local[key]).toEqual(value);
      expect(port.sync).toEqual(original.storageSync);
      expect(port.writes.every((key) => key.startsWith(storagePrefix))).toBe(
        true,
      );
      expect(port.writes.at(-1)).toBe(headKey);
      expect((await service.backup(review.backupDigest)).capturedAt).toBe(
        clock(),
      );
    },
  );
  it('is idempotent across new background instances and lost acknowledgements', async () => {
    const { source, port, service, lock } = setup();
    const { review, decisions, status } = await activate(
      service,
      source.localStorage,
    );
    const writes = port.writes.length;
    const restarted = new StorageCoordinator(port, lock, clock);
    expect(
      await restarted.commit(source.localStorage, review, decisions),
    ).toEqual(status);
    await expect(restarted.prepare(source.localStorage)).rejects.toThrow(
      'ALREADY_ACTIVE',
    );
    expect(port.writes).toHaveLength(writes);
  });
  for (const failure of ['before', 'after', 'drop'] as const) {
    it.each([1, 2, 3, 4])(
      'preserves originals and safely retries a ' +
        failure +
        ' failure at write %i',
      async (failAt) => {
        const { source, port, lock, service } = setup();
        const original = structuredClone(source);
        port.failAt = failAt;
        port.failure = failure;
        await expect(activate(service, source.localStorage)).rejects.toThrow(
          /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
        );
        expect(source).toEqual(original);
        for (const [key, value] of Object.entries(original.storageLocal))
          expect(port.local[key]).toEqual(value);
        expect(port.sync).toEqual(original.storageSync);
        port.failAt = 0;
        const restarted = new StorageCoordinator(port, lock, clock);
        if ((await restarted.status()).status !== 'ready')
          await activate(restarted, source.localStorage);
        expect((await restarted.requireActiveData()).data.lists).toHaveLength(
          2,
        );
      },
    );
  }
  it('exports a complete read-only recovery file even if no backup fits within quota', async () => {
    const { service, source, port } = setup('damaged-profile');
    port.failAt = 1;
    await expect(service.prepare(source.localStorage)).rejects.toThrow(
      'STORAGE_WRITE_FAILED',
    );
    expect(await service.exportRecovery(source.localStorage)).toMatchObject({
      format: 'bulk-url-opener-recovery',
      sources: source,
    });
    expect(port.writes).toHaveLength(1);
    expect(port.local).not.toHaveProperty(headKey);
  });
  it.each(['document', 'mirror', 'sync'])(
    'rejects a stale review when the %s source changes',
    async (store) => {
      const { service, source, port } = setup();
      const review = await service.prepare(source.localStorage);
      if (store === 'document')
        source.localStorage.previous_list_input = '["changed draft"]';
      if (store === 'mirror') port.local.lists = [];
      if (store === 'sync') port.sync.user_settings = '{}';
      await expect(
        service.commit(source.localStorage, review, reviewed(review.plan)),
      ).rejects.toThrow('SOURCES_CHANGED');
      expect(port.local).not.toHaveProperty(headKey);
      expect((await service.backup(review.backupDigest)).sources).toEqual(
        profile('current-profile'),
      );
    },
  );
  it('rechecks sources after staging, before publishing a completion marker', async () => {
    const { service, source, port } = setup();
    const review = await service.prepare(source.localStorage);
    const originalWrite = port.writeLocal.bind(port);
    vi.spyOn(port, 'writeLocal').mockImplementation(async (values) => {
      await originalWrite(values);
      if (
        Object.keys(values).some((key) =>
          key.startsWith(storagePrefix + 'state:'),
        )
      )
        port.sync.user_settings = '{}';
    });
    await expect(
      service.commit(source.localStorage, review, reviewed(review.plan)),
    ).rejects.toThrow('SOURCES_CHANGED');
    expect(port.local).not.toHaveProperty(headKey);
  });
  it('serializes simultaneous identical commits through a shared writer lock', async () => {
    const { service, source, port, lock } = setup();
    const another = new StorageCoordinator(port, lock, clock);
    const review = await service.prepare(source.localStorage);
    const decisions = reviewed(review.plan);
    const result = await Promise.all([
      service.commit(source.localStorage, review, decisions),
      another.commit(source.localStorage, review, decisions),
    ]);
    expect(result[0]).toEqual(result[1]);
    expect(port.writes.filter((key) => key === headKey)).toHaveLength(1);
  });
  it('rejects a simultaneous different decision rather than overwriting the winner', async () => {
    const { service, source, port, lock } = setup('conflicting-mirrors');
    const another = new StorageCoordinator(port, lock, clock);
    const review = await service.prepare(source.localStorage);
    const one = reviewed(review.plan);
    const two = structuredClone(one);
    two.preferences.tabCreationDelay = review.plan.preferences.find(
      (item) => item.key === 'tabCreationDelay',
    )!.options[1]!.id;
    const results = await Promise.allSettled([
      service.commit(source.localStorage, review, one),
      another.commit(source.localStorage, review, two),
    ]);
    expect(results.map((item) => item.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(
      (await service.requireActiveData()).data.settings.tabCreationDelay,
    ).toBe(0.2);
    expect(port.writes.filter((key) => key === headKey)).toHaveLength(1);
  });
  it.each(['backup', 'stage', 'state', 'head'])(
    'blocks active reads after %s corruption while allowing a raw export',
    async (kind) => {
      const { service, source, port } = setup();
      await activate(service, source.localStorage);
      const key =
        kind === 'head'
          ? headKey
          : Object.keys(port.local).find((key) =>
              key.startsWith(storagePrefix + kind + ':'),
            )!;
      port.local[key] = { schemaVersion: 999 };
      await expect(service.requireActiveData()).rejects.toThrow(
        'INTEGRITY_CHECK_FAILED',
      );
      const writes = port.writes.length;
      await expect(service.prepare(source.localStorage)).rejects.toThrow(
        'INTEGRITY_CHECK_FAILED',
      );
      expect(await service.exportRecovery(source.localStorage)).toMatchObject({
        sources: { storageLocal: { [key]: { schemaVersion: 999 } } },
      });
      expect(port.writes).toHaveLength(writes);
    },
  );
  it('detects content corruption even when the record still passes its schema', async () => {
    const { service, source, port } = setup();
    const { review } = await activate(service, source.localStorage);
    const key = storagePrefix + 'backup:' + review.backupDigest;
    const backup = structuredClone(await service.backup(review.backupDigest));
    backup.sources.localStorage.previous_list_input =
      '["different raw content"]';
    port.local[key] = backup;
    await expect(service.status()).rejects.toThrow('INTEGRITY_CHECK_FAILED');
  });
  it('fails closed on an unrecognized managed key or a null head', async () => {
    const { service, source, port } = setup();
    port.local[storagePrefix + 'future'] = { version: 2 };
    await expect(service.prepare(source.localStorage)).rejects.toThrow(
      'UNKNOWN_STORAGE_VERSION',
    );
    delete port.local[storagePrefix + 'future'];
    port.local[headKey] = null;
    await expect(service.prepare(source.localStorage)).rejects.toThrow(
      'INTEGRITY_CHECK_FAILED',
    );
    expect(port.writes).toEqual([]);
  });
  it('never initializes defaults over unexplained state when the head disappears', async () => {
    const { service, source, port } = setup();
    await activate(service, source.localStorage);
    delete port.local[headKey];
    await expect(service.prepare({})).rejects.toThrow('ORPHANED_STATE');
    expect(port.local).not.toHaveProperty(headKey);
  });
  it('restores the exact reviewed choices after interruption before the head write', async () => {
    const { service, source, port, lock } = setup('conflicting-mirrors');
    const review = await service.prepare(source.localStorage);
    const choices = reviewed(review.plan);
    choices.preferences.tabCreationDelay = review.plan.preferences.find(
      (item) => item.key === 'tabCreationDelay',
    )!.options[1]!.id;
    port.failAt = 4;
    await expect(
      service.commit(source.localStorage, review, choices),
    ).rejects.toThrow('STORAGE_WRITE_FAILED');
    port.failAt = 0;
    const restarted = new StorageCoordinator(port, lock, clock);
    const resumed = await restarted.prepare(source.localStorage);
    expect(resumed.resumeDecisions).toEqual(choices);
    expect(
      (
        await restarted.commit(
          source.localStorage,
          resumed,
          resumed.resumeDecisions!,
        )
      ).data!.settings.tabCreationDelay,
    ).toBe(4);
  });
  it('rolls back with a new verified revision, keeps all recovery records and allows deliberate migration again', async () => {
    const { service, source, port } = setup();
    const { status } = await activate(service, source.localStorage);
    const beforeKeys = Object.keys(port.local);
    const rolledBack = await service.rollback(status.head!);
    expect(rolledBack).toMatchObject({
      status: 'rolled-back',
      data: null,
      head: { revision: 2 },
    });
    await expect(service.requireActiveData()).rejects.toThrow(
      'MIGRATION_REQUIRED',
    );
    expect(Object.keys(port.local)).toEqual(expect.arrayContaining(beforeKeys));
    expect(await service.rollback(status.head!)).toEqual(rolledBack);
    expect((await activate(service, source.localStorage)).status).toMatchObject(
      { status: 'ready', head: { revision: 3 } },
    );
  });
  it.each(['before', 'after', 'drop'] as const)(
    'recovers a rollback completion-marker failure: %s',
    async (failure) => {
      const { service, source, port, lock } = setup();
      const { status } = await activate(service, source.localStorage);
      port.failAt = port.writes.length + 2;
      port.failure = failure;
      await expect(service.rollback(status.head!)).rejects.toThrow(
        /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
      );
      port.failAt = 0;
      const restarted = new StorageCoordinator(port, lock, clock);
      expect((await restarted.rollback(status.head!)).status).toBe(
        'rolled-back',
      );
    },
  );
  it('does not silently replace a corrupted immutable backup on retry', async () => {
    const { service, source, port } = setup();
    port.failAt = 1;
    port.failure = 'corrupt';
    await expect(service.prepare(source.localStorage)).rejects.toThrow(
      'WRITE_VERIFICATION_FAILED',
    );
    port.failAt = 0;
    await expect(service.prepare(source.localStorage)).rejects.toThrow(
      'INTEGRITY_CHECK_FAILED',
    );
    expect(port.local).not.toHaveProperty(headKey);
  });
  it('recovers its in-memory queue after failures without leaking backend errors', async () => {
    const { service, port } = setup();
    port.readFailure = true;
    await expect(service.status()).rejects.toThrow('STORAGE_READ_FAILED');
    port.readFailure = false;
    expect((await service.status()).status).toBe('uninitialized');
  });
  it('does not modify the backup when a later candidate needs review', async () => {
    const { service, source, port } = setup('damaged-profile');
    const review = await service.prepare(source.localStorage);
    const writes = port.writes.length;
    await expect(
      service.commit(source.localStorage, review, {
        acknowledgeIssues: false,
        preferences: {},
        historical: {},
      }),
    ).rejects.toThrow('REVIEW_REQUIRED');
    expect(port.writes).toHaveLength(writes);
    expect((await service.backup(review.backupDigest)).sources).toEqual(source);
  });
  it('preserves reserved keys through persistent backup, state and recovery export', async () => {
    const source = JSON.parse(
      '{"localStorage":{"__proto__":"raw original","constructor":"also original"},"storageLocal":{"prototype":{"unknown":true}},"storageSync":{}}',
    ) as typeof empty;
    const port = new MemoryStorage(source);
    const service = new StorageCoordinator(port, mutex(), clock);
    const { review } = await activate(service, source.localStorage);
    expect((await service.backup(review.backupDigest)).sources).toEqual(source);
    expect(
      (await service.exportRecovery(source.localStorage)).sources.localStorage,
    ).toEqual(source.localStorage);
  });
  it('preserves every line and list in a larger synthetic migration', async () => {
    const source = structuredClone(empty);
    for (let id = 0; id < 300; id++) {
      source.localStorage[String(id)] = JSON.stringify({
        object_description: 'list_storage',
        list_id: id,
        list_name: 'Synthetic ' + String(id),
        list_links: Array.from(
          { length: 40 },
          (_, line) =>
            'https://scale.example.test/' +
            String(id) +
            '?q=' +
            String(line) +
            '%26café',
        ),
      });
    }
    const service = new StorageCoordinator(
      new MemoryStorage(source),
      mutex(),
      clock,
    );
    const { review, status } = await activate(service, source.localStorage);
    expect(status.data!.lists).toHaveLength(300);
    expect(
      status.data!.lists.reduce((sum, list) => sum + list.lines.length, 0),
    ).toBe(12_000);
    expect((await service.backup(review.backupDigest)).sources).toEqual(source);
  });
  it('does not require an existing profile to initialize a verified fresh store', async () => {
    const port = new MemoryStorage(empty);
    const service = new StorageCoordinator(port, mutex(), clock);
    const plan = await analyzeSources(empty);
    const { status } = await activate(service, {});
    expect(status.data!.lists).toEqual([]);
    expect(status.data!.settings.contextMenuEnabled).toBe(true);
    expect(plan.issues).toEqual([]);
  });
});
