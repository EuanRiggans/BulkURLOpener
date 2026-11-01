import { describe, expect, it } from 'vitest';
import { SavedListMenus } from '../../src/application/menus';
import {
  StartupOpening,
  type StartupPort,
  type StartupRecord,
} from '../../src/application/opening/startup';
import { MigrationError } from '../../src/domain/storage/errors';
import { mutex, profile } from './storage-support';
import { sharedSetup, token } from './shared-support';

describe('basic saved-list menus', () => {
  it('uses only the exact required hierarchy and an explicitly disabled empty state', async () => {
    const { storage, menus, browser } = await sharedSetup();
    await menus.refresh();
    expect(browser.menu).toEqual([
      { id: 'buo-root', title: 'Bulk URL Opener' },
      { id: 'buo-open-lists', title: 'Open Lists', parentId: 'buo-root' },
      {
        id: 'buo-empty',
        title: 'No saved lists',
        parentId: 'buo-open-lists',
        enabled: false,
      },
    ]);
    await storage.mutate({
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: {
        kind: 'list.create',
        name: 'Example <text> & notes',
        lines: [],
      },
    });
    await menus.refresh();
    expect(browser.menu).toHaveLength(3);
    expect(browser.menu[2]).toEqual({
      id: 'buo-list:list-' + token(1),
      title: 'Example <text> & notes',
      parentId: 'buo-open-lists',
    });
    await storage.mutate({
      id: token(2),
      expectedHead: (await storage.requireActiveData()).head,
      command: { kind: 'list.delete', id: 'list-' + token(1) },
    });
    await menus.refresh();
    expect(browser.menu[2]?.id).toBe('buo-empty');
  });
  it('preserves existing disabled preferences and refreshes after enable/name changes', async () => {
    const { storage, menus, browser } = await sharedSetup(
      profile('current-profile'),
    );
    await menus.refresh();
    expect(browser.menu).toEqual([]);
    await storage.mutate({
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: { kind: 'settings.update', patch: { contextMenuEnabled: true } },
    });
    await menus.refresh();
    expect(browser.menu).toHaveLength(4);
    const list = (await storage.requireActiveData()).data.lists[0]!;
    await storage.mutate({
      id: token(2),
      expectedHead: (await storage.requireActiveData()).head,
      command: {
        kind: 'list.update',
        id: list.id,
        name: 'Changed title',
        lines: list.lines,
      },
    });
    await menus.refresh();
    expect(browser.menu[2]?.title).toBe('Changed title');
  });
  it('clears partial menus on API failure and can retry without a poisoned queue', async () => {
    const { storage, browser } = await sharedSetup();
    let fail = true;
    const menus = new SavedListMenus(storage, {
      clear: () => {
        browser.menu = [];
        return Promise.resolve();
      },
      create: (item) => {
        if (fail && item.id === 'buo-open-lists')
          return Promise.reject(new Error('menu API failure'));
        browser.menu.push(item);
        return Promise.resolve();
      },
    });
    await expect(menus.refresh()).rejects.toThrow('MENU_REFRESH_FAILED');
    expect(browser.menu).toEqual([]);
    fail = false;
    await menus.refresh();
    expect(browser.menu).toHaveLength(3);
  });
});

describe('startup session latch', () => {
  function sessionPort() {
    const state: {
      value: StartupRecord | undefined;
      windowReady: boolean;
      failDone: boolean;
    } = { value: undefined, windowReady: true, failDone: false };
    const port: StartupPort = {
      exclusive: mutex(),
      read: () => Promise.resolve(structuredClone(state.value)),
      write: (record) => {
        if (state.failDone && record.status === 'done')
          return Promise.reject(new Error('session acknowledgement lost'));
        state.value = structuredClone(record);
        return Promise.resolve();
      },
      token: () => token(800),
      normalWindow: () =>
        state.windowReady
          ? Promise.resolve(1)
          : Promise.reject(new MigrationError('NO_TARGET_WINDOW')),
    };
    return { state, port };
  }
  it('never treats background evaluation as a new browser startup', async () => {
    const { storage, opening } = await sharedSetup(profile('current-profile'));
    const { port, state } = sessionPort();
    await new StartupOpening(storage, opening, port).recover();
    expect(state.value).toBeUndefined();
    expect(await opening.list()).toEqual([]);
  });
  it('uses the same service/settings policy and deduplicates startup across worker instances', async () => {
    const { storage, opening, runner, browser } = await sharedSetup(
      profile('current-profile'),
    );
    const { port, state } = sessionPort();
    await new StartupOpening(storage, opening, port).event();
    await new StartupOpening(storage, opening, port).event();
    await runner.kick();
    const jobs = await opening.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.plan.trigger).toBe('startup');
    expect(jobs[0]?.plan.settings).toMatchObject({
      tabCreationDelay: 0.2,
      openUrlsInReverseOrder: true,
      automaticallyRemoveDuplicateUrls: true,
    });
    expect(browser.created.map((tab) => tab.url)).toEqual(
      jobs[0]!.plan.destinations.map((item) => item.url),
    );
    expect(state.value?.status).toBe('done');
  });
  it('waits for a normal window when startup fires before a window exists', async () => {
    const { storage, opening } = await sharedSetup(profile('current-profile'));
    const { port, state } = sessionPort();
    state.windowReady = false;
    const startup = new StartupOpening(storage, opening, port);
    await startup.event();
    expect(state.value).toMatchObject({
      status: 'pending',
      outcome: 'NO_TARGET_WINDOW',
    });
    expect(await opening.list()).toEqual([]);
    state.windowReady = true;
    await startup.recover();
    expect(await opening.list()).toHaveLength(1);
    expect(state.value?.status).toBe('done');
  });
  it('keeps a disabled startup handled even if that setting changes later in the same session', async () => {
    const { storage, opening, runner, browser } = await sharedSetup();
    const { port } = sessionPort();
    const startup = new StartupOpening(storage, opening, port);
    await startup.event();
    await storage.mutate({
      id: token(1),
      expectedHead: (await storage.requireActiveData()).head,
      command: {
        kind: 'list.create',
        name: 'Startup example',
        lines: ['https://start.example.test/'],
      },
    });
    await storage.mutate({
      id: token(2),
      expectedHead: (await storage.requireActiveData()).head,
      command: {
        kind: 'settings.update',
        patch: { openOnLaunch: 'list-' + token(1) },
      },
    });
    await startup.event();
    await startup.recover();
    await runner.kick();
    expect(browser.created).toEqual([]);
    expect(await opening.list()).toHaveLength(0);
  });
  it('reuses the durable job if acknowledgement of the startup latch is lost', async () => {
    const { storage, opening } = await sharedSetup(profile('current-profile'));
    const { port, state } = sessionPort();
    state.failDone = true;
    await expect(
      new StartupOpening(storage, opening, port).event(),
    ).rejects.toThrow('session acknowledgement lost');
    expect(await opening.list()).toHaveLength(1);
    state.failDone = false;
    await new StartupOpening(storage, opening, port).recover();
    expect(await opening.list()).toHaveLength(1);
    expect(state.value?.status).toBe('done');
  });
});
