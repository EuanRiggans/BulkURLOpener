import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { createMigrationListener } from '../application/storage/messages';
import { createStorageCoordinator } from '../infrastructure/browser/storage';
import { OpeningService } from '../application/opening/service';
import { OpeningRunner } from '../application/opening/runner';
import { StartupOpening } from '../application/opening/startup';
import { SavedListMenus, menuListPrefix } from '../application/menus';
import { SharedServices, createServiceListener } from '../application/services';
import {
  browserMenuPort,
  browserRunnerPort,
  browserSessionId,
  browserStartupPort,
  dueAlarm,
  normalWindow,
  recoveryAlarm,
  requireTransmissionConsent,
  prepareOpeningRecovery,
  ensureRecoveryAlarm,
} from '../infrastructure/browser/opening';
import { browserServicePlatform } from '../infrastructure/browser/services';
import { pageUrl } from '../infrastructure/browser/pages';
import { headKey, listIdSchema } from '../domain/storage/schema';
import { MigrationError } from '../domain/storage/errors';
import { newRequestId } from '../shared/ids';
import * as v from 'valibot';

export default defineBackground(() => {
  const storage = createStorageCoordinator(ensureRecoveryAlarm);
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
    await services.dispatch(
      { type: 'buo:service/deferred.load', job, index, navigate: true },
      {
        id: identity.id,
        url: tab.url,
        tab: { id: tabId, windowId: tab.windowId, incognito: tab.incognito },
      },
    );
  }

  // Register every listener synchronously before asynchronous bootstrap work.
  browser.runtime.onMessage.addListener(
    createMigrationListener(storage, identity),
  );
  browser.runtime.onMessage.addListener(createServiceListener(services));
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
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[headKey]) safe(bootstrap());
  });
  browser.windows.onCreated.addListener(() =>
    safe(
      (async () => {
        await startup.recover();
        await runner.kick();
      })(),
    ),
  );
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
          if (tab?.incognito)
            throw new MigrationError('PRIVATE_WINDOW_UNSUPPORTED');
          await requireTransmissionConsent();
          const target = await normalWindow(windowId);
          const job = await opening.enqueue({
            kind: 'list',
            trigger: 'context-menu',
            id: newRequestId(),
            listId,
            windowId: target,
          });
          safe(runner.kick());
          if (
            job.plan.settings.tabCreationDelay > 0 ||
            job.plan.rejected.length > 0
          )
            await progress(target, { job: job.plan.id });
          await runner.kick();
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
