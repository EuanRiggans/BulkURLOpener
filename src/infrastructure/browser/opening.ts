import { browser } from 'wxt/browser';
import type { RunnerPort } from '../../application/opening/runner';
import type { MenuPort } from '../../application/menus';
import type { StartupPort } from '../../application/opening/startup';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import { sameContent } from '../../domain/storage/migrate';
import { hasTransmissionConsent } from '../../shared/data-consent';
import { newRequestId } from '../../shared/ids';
import { pageUrl } from './pages';
import { hashSchema } from '../../domain/storage/schema';
import * as v from 'valibot';

export const recoveryAlarm = 'buo-opening-recovery';
export const dueAlarm = 'buo-opening-due';
const startupKey = 'buo:v2:startup-session';
const runtimeSessionKey = 'buo:v2:runtime-session';

export async function browserSessionId(): Promise<string> {
  requireCondition(navigator.locks, 'LOCK_UNAVAILABLE');
  return navigator.locks.request('buo-v2-browser-session', async () => {
    const value: unknown = (
      await browser.storage.session.get(runtimeSessionKey)
    )[runtimeSessionKey];
    if (value !== undefined) {
      requireCondition(v.is(hashSchema, value), 'STARTUP_SESSION_INVALID');
      return value;
    }
    const id = newRequestId();
    await browser.storage.session.set({ [runtimeSessionKey]: id });
    requireCondition(
      (await browser.storage.session.get(runtimeSessionKey))[
        runtimeSessionKey
      ] === id,
      'STARTUP_SESSION_INVALID',
    );
    return id;
  });
}

export async function requireTransmissionConsent(): Promise<void> {
  if (import.meta.env.FIREFOX)
    requireCondition(
      hasTransmissionConsent(await browser.permissions.getAll()),
      'DATA_CONSENT_REQUIRED',
    );
}
export async function prepareOpeningRecovery(): Promise<void> {
  await requireTransmissionConsent();
  await ensureRecoveryAlarm();
}
export async function ensureRecoveryAlarm(): Promise<void> {
  try {
    const alarm = await deadline(browser.alarms.get(recoveryAlarm));
    if (!alarm || alarm.periodInMinutes !== 0.5)
      await deadline(
        browser.alarms.create(recoveryAlarm, { periodInMinutes: 0.5 }),
      );
  } catch {
    throw new MigrationError('RECOVERY_ALARM_FAILED');
  }
}
export async function normalWindow(id: number | null): Promise<number> {
  let window;
  try {
    window =
      id === null
        ? await browser.windows.getLastFocused({ windowTypes: ['normal'] })
        : await browser.windows.get(id);
  } catch {
    throw new MigrationError('NO_TARGET_WINDOW');
  }
  requireCondition(!window.incognito, 'PRIVATE_WINDOW_UNSUPPORTED');
  requireCondition(
    typeof window.id === 'number' && window.id >= 0,
    'NO_TARGET_WINDOW',
  );
  return window.id;
}
export async function startupWindow(id: number | null): Promise<number> {
  if (id !== null) return normalWindow(id);
  const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
  const window =
    windows.find((window) => !window.incognito && window.focused) ??
    windows.find((window) => !window.incognito);
  requireCondition(window?.id !== undefined, 'NO_TARGET_WINDOW');
  return window.id;
}

function deadline<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new MigrationError('BROWSER_OPERATION_TIMEOUT')),
      10_000,
    );
    void work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function browserRunnerPort(kick: () => void): RunnerPort {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    now: Date.now,
    sessionId: browserSessionId,
    sleep: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    own: async (work) => {
      requireCondition(navigator.locks, 'LOCK_UNAVAILABLE');
      await navigator.locks.request(
        'buo-v2-opening-runner',
        { ifAvailable: true },
        async (lock) => {
          if (lock) await work();
        },
      );
    },
    ensureAlarm: prepareOpeningRecovery,
    wake: (milliseconds) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        kick,
        Math.min(Math.max(0, milliseconds), 2_147_483_647),
      );
      void browser.alarms
        .create(dueAlarm, { when: Date.now() + Math.max(30_000, milliseconds) })
        .catch(() => undefined);
    },
    createTab: async (url, windowId) => {
      await requireTransmissionConsent();
      const target = await normalWindow(windowId);
      const tab = await deadline(
        browser.tabs.create({ url, windowId: target, active: false }),
      );
      requireCondition(tab.id !== undefined, 'TAB_ID_MISSING');
      return tab.id;
    },
    idle: async () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await deadline(
        Promise.all([
          browser.alarms.clear(recoveryAlarm),
          browser.alarms.clear(dueAlarm),
        ]),
      );
    },
    activateTab: async (tabId) => {
      await deadline(browser.tabs.update(tabId, { active: true }));
    },
    deferredUrl: (job, index) => pageUrl('/deferred.html', { job, index }),
  };
}

export const browserMenuPort: MenuPort = {
  clear: () =>
    new Promise((resolve, reject) => {
      browser.contextMenus.removeAll(() => {
        if (browser.runtime.lastError)
          reject(new MigrationError('MENU_REFRESH_FAILED'));
        else resolve();
      });
    }),
  create: (item) =>
    new Promise((resolve, reject) => {
      browser.contextMenus.create({ ...item, contexts: ['all'] }, () => {
        if (browser.runtime.lastError)
          reject(new MigrationError('MENU_REFRESH_FAILED'));
        else resolve();
      });
    }),
};

export const browserStartupPort: StartupPort = {
  exclusive: async (work) => {
    requireCondition(navigator.locks, 'LOCK_UNAVAILABLE');
    return navigator.locks.request('buo-v2-startup-session', work);
  },
  read: async () => (await browser.storage.session.get(startupKey))[startupKey],
  write: async (record) => {
    await browser.storage.session.set({ [startupKey]: record });
    requireCondition(
      sameContent(
        (await browser.storage.session.get(startupKey))[startupKey],
        record,
      ),
      'STARTUP_SESSION_INVALID',
    );
  },
  token: newRequestId,
  normalWindow: startupWindow,
};
