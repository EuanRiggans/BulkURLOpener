import { browser } from 'wxt/browser';
import type { ServicePlatform } from '../../application/services';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import { normalWindow, requireTransmissionConsent } from './opening';

export const browserServicePlatform: ServicePlatform = {
  targetWindow: normalWindow,
  allowTransmission: requireTransmissionConsent,
  capture: async (scope, windowId) => {
    const tabs = await browser.tabs.query(
      scope === 'currentWindow' ? { windowId } : {},
    );
    const urls: string[] = [];
    let skipped = 0;
    for (const tab of tabs) {
      if (tab.incognito || !tab.url) skipped++;
      else urls.push(tab.url);
    }
    return { urls, skipped };
  },
  tab: async (id) => {
    const tab = await browser.tabs.get(id);
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
    await browser.tabs.update(id, { url });
  },
  deferredLock: async (id, work) => {
    if (!navigator.locks) throw new MigrationError('LOCK_UNAVAILABLE');
    return navigator.locks.request('buo-v2-deferred-' + String(id), work);
  },
};
