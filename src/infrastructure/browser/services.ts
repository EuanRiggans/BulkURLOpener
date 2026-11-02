import { browser } from 'wxt/browser';
import type { ServicePlatform } from '../../application/services';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import { scopedWindow, requireTransmissionConsent } from './opening';
import { pageUrl } from './pages';

export function createBrowserServicePlatform(
  privateMode = false,
  guard: () => Promise<void> = () => Promise.resolve(),
): ServicePlatform {
  return {
    mainWindow: async (targetWindow) => {
      await guard();
      await browser.windows.create({
        url: pageUrl('/popup.html', { window: targetWindow }),
        type: 'popup',
        width: 660,
        height: 640,
        incognito: privateMode,
      });
    },
    targetWindow: (id) => scopedWindow(id, privateMode),
    allowTransmission: requireTransmissionConsent,
    capture: async (scope, windowId) => {
      const tabs = await browser.tabs.query(
        scope === 'currentWindow' ? { windowId } : {},
      );
      const urls: string[] = [];
      let skipped = 0;
      for (const tab of tabs) {
        if (Boolean(tab.incognito) !== privateMode || !tab.url) skipped++;
        else urls.push(tab.url);
      }
      return { urls, skipped };
    },
    tab: async (id) => {
      await guard();
      const tab = await browser.tabs.get(id);
      requireCondition(
        Boolean(tab.incognito) === privateMode,
        'WINDOW_SCOPE_MISMATCH',
      );
      const window = await browser.windows.get(tab.windowId);
      requireCondition(tab.url !== undefined, 'DEFERRED_NOT_AVAILABLE');
      return {
        id,
        url: tab.url,
        active: tab.active,
        focused: Boolean(window.focused),
        incognito: tab.incognito,
      };
    },
    navigate: async (id, url) => {
      await guard();
      requireCondition(
        Boolean((await browser.tabs.get(id)).incognito) === privateMode,
        'WINDOW_SCOPE_MISMATCH',
      );
      await browser.tabs.update(id, { url });
    },
    deferredLock: async (id, work) => {
      if (!navigator.locks) throw new MigrationError('LOCK_UNAVAILABLE');
      return navigator.locks.request(
        'buo-v2-deferred-' + (privateMode ? 'private-' : '') + String(id),
        work,
      );
    },
  };
}
export const browserServicePlatform = createBrowserServicePlatform();
