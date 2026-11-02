import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { createStorageCoordinator } from '../infrastructure/browser/storage';
import { OpeningService } from '../application/opening/service';
import { OpeningRunner } from '../application/opening/runner';
import { StartupOpening } from '../application/opening/startup';
import { SavedListMenus, menuListPrefix } from '../application/menus';
import { SharedServices } from '../application/services';
import {
  createPageListener,
  type PageBackend,
} from '../application/page-router';
import { createPrivateWorkspace } from '../infrastructure/browser/private-workspace';
import type { PrivateWorkspace } from '../application/storage/session-workspace';
import {
  browserMenuPort,
  browserRunnerPort,
  browserSessionId,
  browserStartupPort,
  dueAlarm,
  recoveryAlarm,
  requireTransmissionConsent,
  prepareOpeningRecovery,
  ensureRecoveryAlarm,
  scopedWindow,
  privateDueAlarm,
  privateRecoveryAlarm,
} from '../infrastructure/browser/opening';
import {
  browserServicePlatform,
  createBrowserServicePlatform,
} from '../infrastructure/browser/services';
import { pageUrl } from '../infrastructure/browser/pages';
import { headKey, listIdSchema } from '../domain/storage/schema';
import { MigrationError, requireCondition } from '../domain/storage/errors';
import { newRequestId } from '../shared/ids';
import * as v from 'valibot';

export default defineBackground(() => {
  const storage = createStorageCoordinator(ensureRecoveryAlarm);
  const privateWorkspaces = createPrivateWorkspace(storage);
  const opening = new OpeningService(
    storage,
    Date.now,
    browserSessionId,
    prepareOpeningRecovery,
  );
  const menus = new SavedListMenus(storage, browserMenuPort);
  const safe = (work: Promise<unknown>) => {
    void work.catch(() => undefined);
  };
  const runner: OpeningRunner = new OpeningRunner(
    storage,
    browserRunnerPort(() => safe(runner.kick())),
  );
  const startup = new StartupOpening(storage, opening, browserStartupPort);
  const identity = {
    id: browser.runtime.id,
    root: browser.runtime.getURL('/'),
  };
  const services = new SharedServices(
    storage,
    opening,
    menus,
    browserServicePlatform,
    identity,
    () => safe(runner.kick()),
  );
  type PrivateBundle = PageBackend & {
    id: string;
    opening: OpeningService;
    runner: OpeningRunner;
  };
  let privateBundle: PrivateBundle | null = null;
  function bundle(workspace: PrivateWorkspace): PrivateBundle {
    if (privateBundle?.id === workspace.id) return privateBundle;
    const guard = () => privateWorkspaces.assertSession(workspace.id);
    const privateOpening = new OpeningService(
      workspace.storage,
      Date.now,
      () => Promise.resolve(workspace.id),
      async () => {
        await guard();
        await prepareOpeningRecovery(true);
      },
    );
    const privateRunner: OpeningRunner = new OpeningRunner(
      workspace.storage,
      browserRunnerPort(() => safe(privateRunner.kick()), {
        private: true,
        guard,
        sessionId: () => Promise.resolve(workspace.id),
      }),
    );
    const privateServices = new SharedServices(
      workspace.storage,
      privateOpening,
      { refresh: () => Promise.resolve() },
      createBrowserServicePlatform(true, guard),
      identity,
      () => safe(privateRunner.kick()),
      true,
    );
    privateBundle = {
      id: workspace.id,
      storage: workspace.storage,
      opening: privateOpening,
      runner: privateRunner,
      services: privateServices,
    };
    return privateBundle;
  }
  async function privateBootstrap() {
    const workspace = await privateWorkspaces.existing();
    if (workspace) await bundle(workspace).runner.kick();
    else privateBundle = null;
  }
  const pageListener = createPageListener(
    {
      origin: async (sender, claimed) => {
        const id = sender.tab?.windowId ?? claimed;
        const window =
          id === null
            ? await browser.windows.getLastFocused()
            : await browser.windows.get(id);
        requireCondition(window.id !== undefined, 'NO_TARGET_WINDOW');
        if (sender.tab?.incognito !== undefined)
          requireCondition(
            sender.tab.incognito === Boolean(window.incognito),
            'WINDOW_SCOPE_MISMATCH',
          );
        if (window.incognito)
          requireCondition(
            await browser.extension.isAllowedIncognitoAccess(),
            'PRIVATE_ACCESS_REQUIRED',
          );
        return { windowId: window.id, private: Boolean(window.incognito) };
      },
      backend: async (context) =>
        context.private
          ? bundle(await privateWorkspaces.open(context.windowId))
          : { services, storage },
    },
    identity,
  );
  const progress = (
    windowId: number | null,
    parameters: Record<string, string>,
  ) =>
    browser.tabs.create({
      url: pageUrl('/opening.html', parameters),
      active: true,
      ...(windowId !== null ? { windowId } : {}),
    });

  async function bootstrap(force = false) {
    safe(menus.refresh(force));
    safe(privateBootstrap());
    try {
      await storage.requireActiveData();
    } catch {
      return;
    }
    try {
      await startup.recover();
    } catch {
      /* Session diagnostics remain local; other jobs can still recover. */
    }
    await runner.kick();
  }
  async function selectedHelper(tabId: number) {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) return;
    const page = new URL(tab.url),
      root = new URL(identity.root);
    if (
      page.protocol !== root.protocol ||
      page.host !== root.host ||
      page.pathname !== '/deferred.html'
    )
      return;
    const job = page.searchParams.get('job'),
      index = Number(page.searchParams.get('index'));
    if (!job) return;
    const scoped = tab.incognito
      ? bundle(await privateWorkspaces.open(tab.windowId)).services
      : services;
    await scoped.dispatch(
      { type: 'buo:service/deferred.load', job, index, navigate: true },
      {
        id: identity.id,
        url: tab.url,
        tab: { id: tabId, windowId: tab.windowId, incognito: tab.incognito },
      },
    );
  }

  // Register every listener synchronously before asynchronous bootstrap work.
  browser.runtime.onMessage.addListener(pageListener);
  browser.runtime.onStartup.addListener(() =>
    safe(
      (async () => {
        safe(menus.refresh(true));
        await startup.event();
        await runner.kick();
      })(),
    ),
  );
  browser.runtime.onInstalled.addListener(() => safe(bootstrap(true)));
  browser.alarms.onAlarm.addListener((alarm) => {
    if ([recoveryAlarm, dueAlarm].includes(alarm.name)) safe(bootstrap());
    if ([privateRecoveryAlarm, privateDueAlarm].includes(alarm.name))
      safe(privateBootstrap());
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[headKey]) safe(bootstrap());
  });
  browser.windows.onCreated.addListener((window) => {
    if (window.incognito && window.id !== undefined)
      safe(privateWorkspaces.noteWindow(window.id));
    safe(
      (async () => {
        await startup.recover();
        await runner.kick();
      })(),
    );
  });
  browser.windows.onRemoved.addListener(() => safe(privateBootstrap()));
  browser.tabs.onActivated.addListener((active) =>
    safe(selectedHelper(active.tabId)),
  );
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId >= 0)
      safe(
        browser.tabs.query({ active: true, windowId }).then(async (tabs) => {
          for (const tab of tabs)
            if (tab.id !== undefined) await selectedHelper(tab.id);
        }),
      );
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (
      typeof info.menuItemId !== 'string' ||
      !info.menuItemId.startsWith(menuListPrefix)
    )
      return;
    const listId = info.menuItemId.slice(menuListPrefix.length);
    if (!v.is(listIdSchema, listId)) return;
    safe(
      (async () => {
        const windowId = tab?.windowId ?? null;
        try {
          await requireTransmissionConsent();
          const window =
            windowId === null
              ? await browser.windows.getLastFocused()
              : await browser.windows.get(windowId);
          const privateMode = Boolean(window.incognito);
          if (privateMode)
            requireCondition(
              await browser.extension.isAllowedIncognitoAccess(),
              'PRIVATE_ACCESS_REQUIRED',
            );
          const target = await scopedWindow(window.id ?? null, privateMode);
          let job;
          let selectedRunner = runner;
          if (privateMode) {
            const selected = bundle(await privateWorkspaces.open(target));
            const source = (await storage.requireActiveData()).data.lists.find(
              (list) => list.id === listId,
            );
            requireCondition(source, 'LIST_NOT_FOUND');
            job = await selected.opening.enqueue({
              kind: 'lines',
              trigger: 'context-menu',
              id: newRequestId(),
              lines: source.lines,
              windowId: target,
            });
            selectedRunner = selected.runner;
          } else
            job = await opening.enqueue({
              kind: 'list',
              trigger: 'context-menu',
              id: newRequestId(),
              listId,
              windowId: target,
            });
          safe(selectedRunner.kick());
          if (
            job.plan.settings.tabCreationDelay > 0 ||
            job.plan.rejected.length > 0
          )
            await progress(target, { job: job.plan.id });
          await selectedRunner.kick();
        } catch (error) {
          await progress(windowId, {
            notice:
              error instanceof MigrationError &&
              error.code === 'PRIVATE_WINDOW_UNSUPPORTED'
                ? 'private'
                : 'failed',
          });
        }
      })(),
    );
  });
  safe(bootstrap(true));
});
