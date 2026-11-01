import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { createServiceListener } from '../../src/application/services';
import { jobViewSchema } from '../../src/domain/opening/schema';
import { profile } from './storage-support';
import { identity, sender, sharedSetup, token } from './shared-support';
import { MigrationError } from '../../src/domain/storage/errors';

describe('shared service boundary', () => {
  it.each([
    { id: identity.id, url: 'https://outside.example.test/popup.html' },
    { id: 'different-extension', url: identity.root + 'popup.html' },
    { id: identity.id, url: identity.root + 'unknown.html' },
    { id: identity.id },
  ])(
    'rejects unauthorized contexts before touching stored data: %j',
    async (from) => {
      const { services, port } = await sharedSetup();
      port.readFailure = true;
      await expect(
        services.dispatch({ type: 'buo:service/library.read' }, from),
      ).rejects.toThrow('UNAUTHORIZED_PAGE');
    },
  );
  it('separates editors from opening commands and restricts each mutation to its intended page', async () => {
    const { services, storage, browser } = await sharedSetup();
    const input = {
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: {
        kind: 'list.create',
        name: 'Example',
        lines: ['https://example.test/'],
      },
    };
    await expect(
      services.dispatch(
        { type: 'buo:service/library.mutate', input },
        sender('popup.html'),
      ),
    ).rejects.toThrow('UNAUTHORIZED_PAGE');
    await services.dispatch(
      { type: 'buo:service/library.mutate', input },
      sender('new-list.html'),
    );
    await expect(
      services.dispatch(
        {
          type: 'buo:service/open.lines',
          id: token(2),
          expectedHead: null,
          lines: ['https://example.test/'],
        },
        sender('edit-list.html'),
      ),
    ).rejects.toThrow('UNAUTHORIZED_PAGE');
    expect(browser.created).toEqual([]);
  });
  it('uses one settings snapshot policy across popup, startup and context-menu jobs', async () => {
    const { services, storage, opening } = await sharedSetup(
      profile('current-profile'),
    );
    const active = await storage.requireActiveData(),
      list = active.data.lists[0]!;
    const popup = v.parse(
      jobViewSchema,
      await services.dispatch(
        {
          type: 'buo:service/open.lines',
          id: token(10),
          expectedHead: active.head,
          lines: list.lines,
        },
        sender('popup.html'),
      ),
    );
    const context = await opening.enqueue({
      kind: 'list',
      trigger: 'context-menu',
      id: token(11),
      listId: list.id,
      windowId: 1,
    });
    await storage.mutate({
      id: token(1),
      expectedHead: active.head,
      command: { kind: 'settings.update', patch: { openOnLaunch: list.id } },
    });
    const startup = await opening.enqueue({
      kind: 'startup',
      id: token(12),
      windowId: 1,
    });
    expect(popup.plan.destinations).toEqual(context.plan.destinations);
    expect(popup.plan.destinations).toEqual(startup.plan.destinations);
    expect(popup.plan.rejected).toEqual(startup.plan.rejected);
  });
  it('preserves capture scope while omitting own UI pages and restoring held destinations', async () => {
    const { services, storage, opening, browser, runner } = await sharedSetup();
    await storage.mutate({
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: {
        kind: 'settings.update',
        patch: {
          currentlyOpenedTabsDisplay: 'allOpenedTabs',
          loadOnFocus: true,
        },
      },
    });
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://held.example.test/?q=%2526'],
    });
    await runner.kick();
    browser.captured = {
      urls: [
        identity.root + 'options.html',
        browser.deferredUrl(job.plan.id, 0),
        'https://ordinary.example.test/',
      ],
      skipped: 2,
    };
    expect(
      await services.dispatch(
        { type: 'buo:service/capture' },
        sender('popup.html'),
      ),
    ).toEqual({
      lines: [
        'https://held.example.test/?q=%2526',
        'https://ordinary.example.test/',
      ],
      skipped: 3,
    });
    expect(browser.captures).toEqual([{ scope: 'allOpenedTabs', windowId: 1 }]);
  });
  it('rejects private-window requests and a private target before any job is persisted', async () => {
    const { services, opening, browser } = await sharedSetup();
    const request = {
      type: 'buo:service/open.lines',
      id: token(10),
      lines: ['https://private.example.test/'],
      expectedHead: null,
    };
    await expect(
      services.dispatch(request, {
        ...sender('popup.html'),
        tab: { id: 10, windowId: 2, incognito: true },
      }),
    ).rejects.toThrow('PRIVATE_WINDOW_UNSUPPORTED');
    browser.targetHook = () =>
      Promise.reject(new MigrationError('PRIVATE_WINDOW_UNSUPPORTED'));
    await expect(
      services.dispatch(request, sender('popup.html')),
    ).rejects.toThrow('PRIVATE_WINDOW_UNSUPPORTED');
    expect(await opening.list()).toEqual([]);
  });
  it('rejects missing data consent before queuing any opening work', async () => {
    const { services, opening, browser } = await sharedSetup();
    browser.allowTransmission = () =>
      Promise.reject(new MigrationError('DATA_CONSENT_REQUIRED'));
    await expect(
      services.dispatch(
        {
          type: 'buo:service/open.lines',
          id: token(10),
          lines: ['https://example.test/'],
          expectedHead: null,
        },
        sender('popup.html'),
      ),
    ).rejects.toThrow('DATA_CONSENT_REQUIRED');
    expect(await opening.list()).toEqual([]);
  });
  it('keeps callback replies compatible and sends fixed errors without backend contents', async () => {
    const { services } = await sharedSetup();
    const listener = createServiceListener(services);
    expect(
      listener({ type: 'unrelated' }, sender('popup.html'), () => undefined),
    ).toBeUndefined();
    const reply = await new Promise((resolve) => {
      expect(
        listener(
          { type: 'buo:service/open.lines', id: 'malformed-private-value' },
          sender('popup.html'),
          resolve,
        ),
      ).toBe(true);
    });
    expect(reply).toEqual({ ok: false, error: 'REQUEST_FAILED' });
  });
});

describe('load-on-focus resolution', () => {
  async function held() {
    const setup = await sharedSetup();
    await setup.storage.mutate({
      id: token(1),
      expectedHead: (await setup.storage.requireActiveData()).head,
      command: {
        kind: 'settings.update',
        patch: { loadOnFocus: true, newTabsActive: true },
      },
    });
    const job = await setup.opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://held.example.test/?q=%2526&label=caf%C3%A9#part'],
    });
    await setup.runner.kick();
    const tab = setup.browser.created[0]!;
    const from = {
      id: identity.id,
      url: tab.url,
      tab: { id: tab.tabId, windowId: 1, incognito: false },
    };
    return { ...setup, job, tab, from };
  }
  it('stores only opaque references in placeholder URLs and never eagerly activates them', async () => {
    const { browser, tab } = await held();
    expect(tab.url).toContain('/deferred.html?job=');
    expect(tab.url).not.toContain('held.example.test');
    expect(browser.activated).toEqual([]);
  });
  it('loads only a selected helper in a focused normal window, preserving encoded destination bytes', async () => {
    const { services, browser, job, tab, from } = await held();
    const request = {
      type: 'buo:service/deferred.load',
      job: job.plan.id,
      index: 0,
      navigate: true,
    };
    expect(await services.dispatch(request, from)).toMatchObject({
      loaded: false,
      ready: true,
    });
    browser.tabs.get(tab.tabId)!.active = true;
    browser.tabs.get(tab.tabId)!.focused = false;
    expect(await services.dispatch(request, from)).toMatchObject({
      loaded: false,
    });
    browser.tabs.get(tab.tabId)!.focused = true;
    expect(await services.dispatch(request, from)).toMatchObject({
      loaded: true,
    });
    expect(browser.navigated[0]?.url).toBe(
      'https://held.example.test/?q=%2526&label=caf%C3%A9#part',
    );
    await expect(services.dispatch(request, from)).rejects.toThrow(
      'UNAUTHORIZED_PAGE',
    );
    expect(browser.navigated).toHaveLength(1);
  });
  it('rejects mismatched route references and a tab that navigated away', async () => {
    const { services, browser, job, tab, from } = await held();
    await expect(
      services.dispatch(
        {
          type: 'buo:service/deferred.load',
          job: token(900),
          index: 0,
          navigate: true,
        },
        from,
      ),
    ).rejects.toThrow('UNAUTHORIZED_PAGE');
    browser.tabs.get(tab.tabId)!.url = 'https://outside.example.test/';
    await expect(
      services.dispatch(
        {
          type: 'buo:service/deferred.load',
          job: job.plan.id,
          index: 0,
          navigate: true,
        },
        from,
      ),
    ).rejects.toThrow('UNAUTHORIZED_PAGE');
    expect(browser.navigated).toEqual([]);
  });
  it('can acknowledge a proven held tab after an interrupted create without replaying it', async () => {
    const { storage, opening, services, browser, runner } = await sharedSetup();
    await storage.mutate({
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: { kind: 'settings.update', patch: { loadOnFocus: true } },
    });
    const job = await opening.enqueue({
      kind: 'lines',
      id: token(10),
      lines: ['https://one.example.test/', 'https://two.example.test/'],
    });
    await storage.withJobs((journal) =>
      journal.change(job.plan.id, job.run.revision, (run) => {
        run.status = 'running';
        run.inFlight = { kind: 'create', index: 0 };
      }),
    );
    await runner.kick();
    const url = browser.deferredUrl(job.plan.id, 0);
    browser.tabs.set(40, {
      id: 40,
      url,
      active: true,
      focused: true,
      incognito: false,
    });
    await services.dispatch(
      {
        type: 'buo:service/deferred.load',
        job: job.plan.id,
        index: 0,
        navigate: true,
      },
      { id: identity.id, url, tab: { id: 40, windowId: 1, incognito: false } },
    );
    expect((await opening.get(job.plan.id)).run).toMatchObject({
      status: 'paused',
      cursor: 1,
    });
    expect(browser.created).toEqual([]);
    expect(browser.navigated).toEqual([
      { id: 40, url: 'https://one.example.test/' },
    ]);
  });
});
