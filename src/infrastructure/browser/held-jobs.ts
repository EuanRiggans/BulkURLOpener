import type { HeldJobs } from '../../domain/opening/history';
import { browser } from 'wxt/browser';
// A failed/incomplete tab query protects every load-on-focus job. Pending URLs
// matter while Chromium is still navigating a newly created holding tab.
export async function heldJobs(privateMode: boolean): Promise<HeldJobs | null> {
  try {
    const root = new URL(browser.runtime.getURL('/'));
    const jobs = new Set<string>();
    const unsettledTabs: number[] = [];
    for (const tab of await browser.tabs.query({})) {
      if (Boolean(tab.incognito) !== privateMode) continue;
      const pending =
        'pendingUrl' in tab && typeof tab.pendingUrl === 'string'
          ? tab.pendingUrl
          : '';
      if (!pending && (!tab.url || tab.url === 'about:blank')) {
        if (tab.id === undefined) return null;
        unsettledTabs.push(tab.id);
      }
      for (const address of [tab.url, pending]) {
        if (!address) continue;
        const url = new URL(address);
        if (
          url.protocol !== root.protocol ||
          url.host !== root.host ||
          url.pathname !== '/deferred.html'
        )
          continue;
        const job = url.searchParams.get('job');
        if (!job || !/^[a-f0-9]{64}$/.test(job)) return null;
        jobs.add(job);
      }
    }
    return { jobs: [...jobs], unsettledTabs };
  } catch {
    return null;
  }
}
