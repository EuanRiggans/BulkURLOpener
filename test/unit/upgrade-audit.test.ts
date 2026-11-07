import { describe, expect, it } from 'vitest';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import {
  auditUpgrade,
  upgradeAuditError,
} from '../../src/application/storage/upgrade-audit';
import { digest } from '../../src/domain/storage/json';
import {
  headKey,
  type RecoveryExport,
  type Sources,
} from '../../src/domain/storage/schema';
import { MemoryStorage, mutex, profile, reviewed } from './storage-support';
import { token } from './shared-support';

async function migrate(source: Sources) {
  const port = new MemoryStorage(source);
  const storage = new StorageCoordinator(port, mutex());
  const review = await storage.prepare(source.localStorage);
  await storage.commit(source.localStorage, review, reviewed(review.plan));
  return {
    port,
    storage,
    after: structuredClone(await storage.exportRecovery(source.localStorage)),
  };
}
async function envelope(sources: Sources): Promise<RecoveryExport> {
  return {
    format: 'bulk-url-opener-recovery',
    schemaVersion: 1,
    capturedAt: '2026-11-06T00:00:00.000Z',
    digest: await digest(sources),
    sources,
  };
}

describe('read-only upgrade preservation audit', () => {
  it.each([
    'current-profile',
    'numeric-profile',
    'pre-json-profile',
    'pre-marker-profile',
    'mirror-only-profile',
    'conflicting-mirrors',
    'damaged-profile',
  ])(
    'compares every retained source and the recorded migration choices: %s',
    async (name) => {
      const before = profile(name);
      before.localStorage['synthetic-private-canary'] =
        'https://private.example.test/canary';
      const { after } = await migrate(before);
      const original = structuredClone({ before, after });
      const result = await auditUpgrade(before, after);
      expect(result.passed).toBe(true);
      expect(result.baseline).toBe('legacy');
      expect(result.checks).toHaveLength(3);
      expect({ before, after }).toEqual(original);
      const text = JSON.stringify(result);
      expect(text).not.toContain('synthetic-private-canary');
      expect(text).not.toContain('canary');
      expect(text).not.toContain('.example.test');
    },
  );
  it('detects loss of malformed and unknown originals even when the active library is intact', async () => {
    const before = profile('damaged-profile');
    before.localStorage['synthetic-unknown-record'] = '{not JSON: café';
    const { after } = await migrate(before);
    delete after.sources.localStorage['synthetic-unknown-record'];
    after.digest = await digest(after.sources);
    const result = await auditUpgrade(before, after);
    expect(result.passed).toBe(false);
    expect(
      result.checks.find((c) => c.code === 'ORIGINAL_RECORDS_UNCHANGED')
        ?.passed,
    ).toBe(false);
  });
  it('accepts a verified canonical recovery pair without changing drafts, jobs or history', async () => {
    const { storage } = await migrate(profile('current-profile'));
    const before = await storage.exportRecovery(
      profile('current-profile').localStorage,
    );
    expect((await auditUpgrade(before, structuredClone(before))).passed).toBe(
      true,
    );
    expect((await auditUpgrade(before, before)).baseline).toBe('canonical');
  });
  it('flags a valid but changed library instead of blessing preservation based on list counts', async () => {
    const source = profile('current-profile');
    const { storage } = await migrate(source);
    const before = await storage.exportRecovery(source.localStorage);
    const active = await storage.requireActiveData();
    const list = active.data.lists[0]!;
    await storage.mutate({
      id: token(940),
      expectedHead: active.head,
      command: {
        kind: 'list.update',
        id: list.id,
        name: list.name,
        lines: [...list.lines].reverse(),
      },
    });
    const result = await auditUpgrade(
      before,
      await storage.exportRecovery(source.localStorage),
    );
    expect(result.passed).toBe(false);
    expect(
      result.checks.find((c) => c.code === 'CANONICAL_DATA_UNCHANGED')?.passed,
    ).toBe(false);
  });
  it('verifies the envelope and the complete active ancestry, not just the current data', async () => {
    const source = profile('current-profile');
    const { after } = await migrate(source);
    const brokenEnvelope = structuredClone(after);
    brokenEnvelope.sources.storageSync.extra = true;
    await expect(auditUpgrade(source, brokenEnvelope)).rejects.toThrow(
      'RECOVERY_DIGEST_MISMATCH',
    );
    const brokenRecord = structuredClone(after.sources);
    const head = brokenRecord.storageLocal[headKey] as { stateDigest: string };
    brokenRecord.storageLocal['buo:v2:state:' + head.stateDigest] = null;
    await expect(
      auditUpgrade(source, await envelope(brokenRecord)),
    ).rejects.toThrow('INTEGRITY_CHECK_FAILED');
  });
  it('refuses a fresh empty install, a portable export or an unverified after-file', async () => {
    const { after } = await migrate(profile('numeric-profile'));
    await expect(
      auditUpgrade(
        { localStorage: {}, storageLocal: {}, storageSync: {} },
        after,
      ),
    ).rejects.toThrow('BASELINE_EMPTY');
    await expect(
      auditUpgrade({ lists: [], settings: {} }, after),
    ).rejects.toThrow('BASELINE_FORMAT_INVALID');
    await expect(
      auditUpgrade(profile('numeric-profile'), after.sources),
    ).rejects.toThrow('RECOVERY_FILE_REQUIRED');
    expect(upgradeAuditError(new Error('private URL and filename'))).toBe(
      'UPGRADE_AUDIT_FAILED',
    );
  });
});
