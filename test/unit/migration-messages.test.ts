import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import { createMigrationListener } from '../../src/application/storage/messages';
import {
  isRecoveryPage,
  requestSchema,
} from '../../src/application/storage/protocol';
import { MemoryStorage, mutex, profile, reviewed } from './storage-support';

const identity = {
  id: 'synthetic-extension',
  root: 'chrome-extension://synthetic-extension/',
};
const sender = { id: identity.id, url: identity.root + 'options.html' };
function setup() {
  const source = profile('current-profile');
  const port = new MemoryStorage(source);
  const service = new StorageCoordinator(port, mutex());
  const listener = createMigrationListener(service, identity);
  function request(message: unknown, from = sender): Promise<unknown> {
    return new Promise((resolve) => {
      expect(listener(message, from, resolve)).toBe(true);
    });
  }
  return { source, port, service, listener, request };
}

describe('migration messaging boundary', () => {
  it('rejects migration from a private extension document before persisting any private source', async () => {
    const { listener, port } = setup();
    const reply = await new Promise((resolve) => {
      expect(
        listener(
          {
            type: 'buo:migration/prepare',
            document: {
              previous_list_input: '["https://private.example.test/"]',
            },
          },
          { ...sender, tab: { incognito: true } },
          resolve,
        ),
      ).toBe(true);
    });
    expect(reply).toEqual({ ok: false, error: 'PRIVATE_WINDOW_UNSUPPORTED' });
    expect(port.writes).toEqual([]);
  });
  it('uses callback replies with literal true for older Chromium and ignores unrelated messages', async () => {
    const { listener, request } = setup();
    expect(
      listener({ type: 'unrelated' }, sender, () => undefined),
    ).toBeUndefined();
    expect(await request({ type: 'buo:migration/status' })).toEqual({
      ok: true,
      value: {
        status: 'uninitialized',
        data: null,
        head: null,
        canRollback: false,
      },
    });
  });
  it.each([
    { id: identity.id, url: 'https://outside.example.test/options.html' },
    { id: 'other-extension', url: sender.url },
    { id: identity.id },
    { id: identity.id, url: identity.root + 'popup.html' },
    { id: identity.id, url: identity.root + 'new-list.html' },
    { id: identity.id, url: 'chrome-extension://other/options.html' },
    { id: identity.id, url: 'invalid URL' },
  ])(
    'rejects an unauthorized context before reading or writing storage: %j',
    async (from) => {
      const { listener, port } = setup();
      port.readFailure = true;
      const reply = await new Promise((resolve) => {
        expect(listener({ type: 'buo:migration/status' }, from, resolve)).toBe(
          true,
        );
      });
      expect(reply).toEqual({ ok: false, error: 'UNAUTHORIZED_PAGE' });
      expect(port.writes).toEqual([]);
    },
  );
  it('accepts the Firefox options page while checking the actual UUID host', () => {
    const root = 'moz-extension://synthetic-uuid/';
    expect(
      isRecoveryPage(
        { id: identity.id, url: root + 'options.html?view=recovery#top' },
        identity.id,
        root,
      ),
    ).toBe(true);
    expect(
      isRecoveryPage(
        { id: identity.id, url: 'moz-extension://different-uuid/options.html' },
        identity.id,
        root,
      ),
    ).toBe(false);
    expect(
      isRecoveryPage(sender, identity.id, 'https://outside.example.test/'),
    ).toBe(false);
  });
  it.each([
    { type: 'buo:migration/unknown' },
    { type: 'buo:migration/prepare', document: { invalid: 1 } },
    { type: 'buo:migration/status', extra: 'untrusted' },
    {
      type: 'buo:migration/commit',
      document: {},
      backupDigest: 'invalid',
      baseHead: null,
      decisions: {},
    },
    { type: 'buo:migration/rollback', expected: { schemaVersion: 2 } },
  ])(
    'validates request payloads and returns a fixed error without private values: %j',
    async (message) => {
      const { request, port } = setup();
      expect(await request(message)).toEqual({
        ok: false,
        error: 'REQUEST_FAILED',
      });
      expect(port.writes).toEqual([]);
    },
  );
  it('round-trips prepare, commit, status, verified backup, export and rollback through the message handler', async () => {
    const { request, service, source } = setup();
    const prepared = await request({
      type: 'buo:migration/prepare',
      document: source.localStorage,
    });
    expect(prepared).toMatchObject({ ok: true });
    const review = await service.prepare(source.localStorage);
    expect(
      await request({
        type: 'buo:migration/commit',
        document: source.localStorage,
        backupDigest: review.backupDigest,
        baseHead: review.baseHead,
        decisions: reviewed(review.plan),
      }),
    ).toMatchObject({ ok: true, value: { status: 'ready' } });
    expect(
      await request({
        type: 'buo:migration/backup',
        digest: review.backupDigest,
      }),
    ).toMatchObject({ ok: true, value: { sources: source } });
    expect(
      await request({
        type: 'buo:migration/export',
        document: source.localStorage,
      }),
    ).toMatchObject({
      ok: true,
      value: { format: 'bulk-url-opener-recovery' },
    });
    const status = await service.status();
    expect(
      await request({ type: 'buo:migration/rollback', expected: status.head }),
    ).toMatchObject({ ok: true, value: { status: 'rolled-back' } });
  });
  it('retains reserved raw keys across the validated transport boundary', () => {
    const request = JSON.parse(
      '{"type":"buo:migration/prepare","document":{"__proto__":"original","constructor":"original too"}}',
    ) as unknown;
    expect(v.parse(requestSchema, request)).toEqual(request);
  });
  it('does not expose backend messages through a failed response', async () => {
    const { request, port } = setup();
    port.readFailure = true;
    expect(await request({ type: 'buo:migration/status' })).toEqual({
      ok: false,
      error: 'STORAGE_READ_FAILED',
    });
  });
});
