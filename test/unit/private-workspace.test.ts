import { describe, expect, it } from 'vitest';
import {
  SessionWorkspace,
  privatePrefix,
  type SessionPort,
} from '../../src/application/storage/session-workspace';
import { SharedServices } from '../../src/application/services';
import { OpeningService } from '../../src/application/opening/service';
import { OpeningRunner } from '../../src/application/opening/runner';
import { createPageListener } from '../../src/application/page-router';
import { createMigrationListener } from '../../src/application/storage/messages';
import { WorkspaceService } from '../../src/application/workspace';
import { StorageCoordinator } from '../../src/application/storage/coordinator';
import { type ServiceSender } from '../../src/application/service-protocol';
import { type LibraryCommand } from '../../src/domain/storage/schema';
import { mutex, MemoryStorage } from './storage-support';
import {
  FakeBrowser,
  identity,
  sender,
  sharedSetup,
  token,
} from './shared-support';

class MemorySession implements SessionPort {
  values: Record<string, unknown> = { 'buo:v2:runtime-session': token(998) };
  live = [10];
  writes: string[] = [];
  idleCalls = 0;
  signals = 0;
  counter = 1000;
  failKey: string | null = null;
  failure: 'before' | 'after' | 'drop' | 'corrupt' = 'before';
  exclusive = mutex();
  read = () => Promise.resolve(structuredClone(this.values));
  windows = () => Promise.resolve([...this.live]);
  token = () => token(this.counter++);
  now = () => '2026-11-02T12:00:00.000Z';
  signal = () => {
    this.signals++;
    return Promise.resolve();
  };
  idle = () => {
    this.idleCalls++;
    return Promise.resolve();
  };
  write(values: Record<string, unknown>): Promise<void> {
    const failed = this.failKey !== null && Object.hasOwn(values, this.failKey);
    this.writes.push(...Object.keys(values));
    if (failed && this.failure === 'before')
      return Promise.reject(new Error('quota'));
    if (failed && this.failure === 'drop') return Promise.resolve();
    Object.assign(this.values, structuredClone(values));
    if (failed && this.failure === 'corrupt') this.values[this.failKey!] = null;
    return failed && this.failure === 'after'
      ? Promise.reject(new Error('interrupted'))
      : Promise.resolve();
  }
  remove(keys: string[]) {
    for (const key of keys) delete this.values[key];
    return Promise.resolve();
  }
}
const privateSender = (page = 'popup.html'): ServiceSender => ({
  ...sender(page),
  tab: { id: 901, windowId: 10, incognito: true },
});
async function setup() {
  const normal = await sharedSetup();
  const initial = await normal.storage.requireActiveData();
  await normal.storage.mutate({
    id: token(1),
    expectedHead: initial.head,
    command: {
      kind: 'list.create',
      name: 'Regular source list',
      lines: ['https://regular.example.test/'],
    },
  });
  const port = new MemorySession();
  const sessions = new SessionWorkspace(port, normal.storage);
  const workspace = await sessions.open(10);
  const browser = new FakeBrowser();
  browser.session = workspace.id;
  const opening = new OpeningService(workspace.storage, browser.now, () =>
    Promise.resolve(workspace.id),
  );
  const runner = new OpeningRunner(workspace.storage, browser);
  const services = new SharedServices(
    workspace.storage,
    opening,
    { refresh: () => Promise.resolve() },
    browser,
    identity,
    () => undefined,
    true,
  );
  return {
    normal,
    port,
    sessions,
    workspace,
    browser,
    opening,
    runner,
    services,
  };
}
async function mutation(
  storage: StorageCoordinator,
  operation: number,
  command: LibraryCommand,
) {
  return storage.mutate({
    id: token(operation),
    expectedHead: (await storage.requireActiveData()).head,
    command,
  });
}
function reply(
  listener: ReturnType<typeof createPageListener>,
  message: unknown,
  from: ServiceSender,
): Promise<unknown> {
  return new Promise((resolve) => {
    expect(listener(message, from, resolve)).toBe(true);
  });
}

describe('session-only private workspace', () => {
  it('copies saved lists/preferences without the normal draft, staging, history or startup side effects', async () => {
    const context = await setup();
    const data = (await context.workspace.storage.requireActiveData()).data;
    expect(data.lists[0]!.name).toBe('Regular source list');
    expect(data.draftLines).toBeNull();
    expect(data.recoveredInputs).toEqual([]);
    expect(data.settings.openOnLaunch).toBeNull();
    expect((await context.workspace.storage.status()).canRollback).toBe(false);
    expect(
      context.port.writes.every((key) => key.startsWith(privatePrefix)),
    ).toBe(true);
  });
  it('keeps private CRUD, settings, drafts, imports and jobs out of storage.local and storage.sync', async () => {
    const context = await setup();
    const local = structuredClone(context.normal.port.local),
      sync = structuredClone(context.normal.port.sync);
    await mutation(context.workspace.storage, 2, {
      kind: 'list.create',
      name: 'Private synthetic list',
      lines: ['https://private.example.test/?q=%2526'],
    });
    await mutation(context.workspace.storage, 3, {
      kind: 'settings.update',
      patch: { nightMode: true, defaultListOpen: 'list-' + token(2) },
    });
    const api = new WorkspaceService(context.workspace.storage);
    await api.saveDraft(
      {
        client: token(50),
        sequence: 1,
        base: null,
        lines: ['Private draft query'],
      },
      true,
    );
    const review = await api.preview(await api.export(false), 'paste');
    await api.apply({
      id: review.id,
      operation: token(4),
      acknowledgeReplacement: true,
      decisions: { acknowledgeIssues: true, preferences: {}, historical: {} },
    });
    await context.opening.enqueue({
      kind: 'lines',
      id: token(5),
      lines: ['https://private.example.test/opened'],
      windowId: 10,
    });
    await context.runner.kick();
    expect((await context.opening.list())[0]!.run.status).toBe('completed');
    expect(JSON.stringify(context.port.values)).toContain(
      'private.example.test',
    );
    expect(context.normal.port.local).toEqual(local);
    expect(context.normal.port.sync).toEqual(sync);
    expect(context.normal.port.syncWrites).toBe(0);
  });
  it('keeps normal and private job lookup, drafts and write authorization separate', async () => {
    const context = await setup();
    const request = {
      type: 'buo:service/draft.save',
      input: {
        client: token(3),
        sequence: 1,
        base: null,
        lines: ['Private text'],
      },
    };
    await context.services.dispatch(request, privateSender());
    await expect(
      context.normal.services.dispatch(request, privateSender()),
    ).rejects.toThrow('PRIVATE_WINDOW_UNSUPPORTED');
    await expect(
      context.services.dispatch(request, sender('popup.html')),
    ).rejects.toThrow('PRIVATE_WINDOW_UNSUPPORTED');
    expect(
      (await new WorkspaceService(context.normal.storage).read()).draft.lines,
    ).toBeNull();
    const job = await context.opening.enqueue({
      kind: 'lines',
      id: token(4),
      lines: ['https://private.example.test/'],
      windowId: 10,
    });
    await expect(context.normal.opening.get(job.plan.id)).rejects.toThrow(
      'JOB_NOT_FOUND',
    );
  });
  it('resumes the same private workspace after a background restart without persisting it to disk storage', async () => {
    const context = await setup();
    await mutation(context.workspace.storage, 2, {
      kind: 'list.update',
      id: 'list-' + token(1),
      name: 'Session edit',
      lines: ['https://session.example.test/'],
    });
    const job = await context.opening.enqueue({
      kind: 'lines',
      id: token(3),
      lines: ['https://private.example.test/'],
      windowId: 10,
    });
    const restarted = await new SessionWorkspace(
      context.port,
      context.normal.storage,
    ).open(10);
    expect(restarted.id).toBe(context.workspace.id);
    expect(
      (await restarted.storage.requireActiveData()).data.lists[0]!.name,
    ).toBe('Session edit');
    expect(
      (await new OpeningService(restarted.storage).get(job.plan.id)).plan
        .destinations[0]!.url,
    ).toBe('https://private.example.test/');
  });
  it('clears the entire private namespace at the end and refuses old callbacks after a new session starts', async () => {
    const context = await setup();
    const api = new WorkspaceService(context.workspace.storage);
    await api.saveDraft({
      client: token(2),
      sequence: 1,
      base: null,
      lines: ['Private ended input'],
    });
    context.port.live = [];
    expect(await context.sessions.existing()).toBeNull();
    expect(context.port.values).toEqual({
      'buo:v2:runtime-session': token(998),
    });
    expect(context.port.idleCalls).toBeGreaterThan(0);
    context.port.live = [11];
    const next = await context.sessions.open(11);
    expect(next.id).not.toBe(context.workspace.id);
    await expect(
      api.saveDraft({
        client: token(3),
        sequence: 1,
        base: null,
        lines: ['Late old callback'],
      }),
    ).rejects.toThrow('PRIVATE_SESSION_ENDED');
    expect(JSON.stringify(context.port.values)).not.toContain(
      'Late old callback',
    );
    expect(
      (await new WorkspaceService(next.storage).read()).draft.lines,
    ).toBeNull();
  });
  it('retains a joined private window, and detects a completely new set of windows after missed cleanup', async () => {
    const context = await setup();
    await context.sessions.noteWindow(11);
    context.port.live = [11];
    expect((await context.sessions.existing())!.id).toBe(context.workspace.id);
    context.port.live = [12];
    const fresh = await context.sessions.open(12);
    expect(fresh.id).not.toBe(context.workspace.id);
  });
  it('keeps malformed active session data intact until the final private window closes', async () => {
    const context = await setup();
    context.port.values[privatePrefix + 'session'] = { damaged: true };
    await expect(context.sessions.open(10)).rejects.toThrow(
      'PRIVATE_SESSION_INVALID',
    );
    expect(context.port.values[privatePrefix + 'session']).toEqual({
      damaged: true,
    });
    context.port.live = [];
    await context.sessions.existing();
    expect(Object.keys(context.port.values)).toEqual([
      'buo:v2:runtime-session',
    ]);
  });
  it.each(['before', 'after', 'drop'] as const)(
    'retries an interrupted initial publication without replacing the chosen seed: %s',
    async (failure) => {
      const normal = await sharedSetup();
      const port = new MemorySession();
      const sessions = new SessionWorkspace(port, normal.storage);
      port.failKey = privatePrefix + 'buo:v2:head';
      port.failure = failure;
      await expect(sessions.open(10)).rejects.toThrow(
        /STORAGE_WRITE_FAILED|WRITE_VERIFICATION_FAILED/,
      );
      const metadata = structuredClone(port.values[privatePrefix + 'session']);
      port.failKey = null;
      const ready = await new SessionWorkspace(port, normal.storage).open(10);
      expect((await ready.storage.status()).status).toBe('ready');
      expect(port.values[privatePrefix + 'session']).toEqual(metadata);
      expect(port.values[privatePrefix + 'seed']).toBeUndefined();
    },
  );
  it('requires an existing regular migration and never creates normal defaults from a private request', async () => {
    const regular = new StorageCoordinator(new MemoryStorage(), mutex());
    const port = new MemorySession();
    await expect(new SessionWorkspace(port, regular).open(10)).rejects.toThrow(
      'PRIVATE_SETUP_REQUIRED',
    );
    expect((await regular.status()).status).toBe('uninitialized');
  });
  it('blocks sync, persistent migration and global startup/menu preference changes in private pages', async () => {
    const context = await setup();
    await expect(
      context.services.dispatch(
        { type: 'buo:service/sync.preview-upload' },
        privateSender('data.html'),
      ),
    ).rejects.toThrow('PRIVATE_SYNC_UNAVAILABLE');
    const active = await context.workspace.storage.requireActiveData();
    await expect(
      context.services.dispatch(
        {
          type: 'buo:service/library.mutate',
          input: {
            id: token(2),
            expectedHead: active.head,
            command: {
              kind: 'settings.update',
              patch: { openOnLaunch: 'list-' + token(1) },
            },
          },
        },
        privateSender('options.html'),
      ),
    ).rejects.toThrow('PRIVATE_PREFERENCE_UNAVAILABLE');
    const listener = createMigrationListener(
      context.workspace.storage,
      identity,
      true,
    );
    const result = await new Promise((resolve) => {
      listener(
        {
          type: 'buo:migration/prepare',
          document: { untouched: 'private document must not persist' },
        },
        privateSender('options.html'),
        resolve,
      );
    });
    expect(result).toEqual({
      ok: false,
      error: 'PRIVATE_MIGRATION_UNAVAILABLE',
    });
    expect(JSON.stringify(context.normal.port.local)).not.toContain(
      'private document',
    );
  });
});

describe('page routing', () => {
  it('routes wrapped and older raw page requests to the verified window scope, ignoring a conflicting target hint', async () => {
    const context = await setup();
    let backendCalls = 0;
    const listener = createPageListener(
      {
        origin: (source, claimed) =>
          Promise.resolve({
            windowId: source.tab?.windowId ?? claimed ?? 1,
            private: source.tab?.windowId === 10,
          }),
        backend: (scope) => {
          backendCalls++;
          return Promise.resolve(
            scope.private
              ? {
                  storage: context.workspace.storage,
                  services: context.services,
                }
              : {
                  storage: context.normal.storage,
                  services: context.normal.services,
                },
          );
        },
      },
      identity,
    );
    const input = { type: 'buo:service/workspace.read' };
    const first = await reply(
      listener,
      { type: 'buo:page', windowId: 1, request: input },
      privateSender(),
    );
    expect(first).toMatchObject({ ok: true, value: { private: true } });
    const normal = await reply(listener, input, sender('popup.html'));
    expect(normal).toMatchObject({ ok: true, value: { private: false } });
    expect(backendCalls).toBe(2);
  });
  it('authorizes the page before resolving windows or touching storage, and answers context without initializing data', async () => {
    let origins = 0,
      backends = 0;
    const context = await setup();
    const listener = createPageListener(
      {
        origin: () => {
          origins++;
          return Promise.resolve({ windowId: 10, private: true });
        },
        backend: () => {
          backends++;
          return Promise.resolve({
            storage: context.workspace.storage,
            services: context.services,
          });
        },
      },
      identity,
    );
    expect(
      await reply(
        listener,
        { type: 'buo:service/context.read' },
        { id: identity.id, url: 'https://outside.example.test/popup.html' },
      ),
    ).toEqual({ ok: false, error: 'UNAUTHORIZED_PAGE' });
    expect(origins).toBe(0);
    expect(backends).toBe(0);
    expect(
      await reply(
        listener,
        { type: 'buo:service/data.preview', text: '{}', source: 'paste' },
        privateSender(),
      ),
    ).toEqual({ ok: false, error: 'UNAUTHORIZED_PAGE' });
    expect(origins).toBe(0);
    expect(backends).toBe(0);
    expect(
      await reply(
        listener,
        { type: 'buo:service/context.read' },
        privateSender(),
      ),
    ).toEqual({ ok: true, value: { private: true } });
    expect(backends).toBe(0);
  });
});
