import { StorageCoordinator } from '../../src/application/storage/coordinator';
import { OpeningService } from '../../src/application/opening/service';
import {
  OpeningRunner,
  type RunnerPort,
} from '../../src/application/opening/runner';
import { SavedListMenus, type MenuItem } from '../../src/application/menus';
import {
  SharedServices,
  type ServicePlatform,
} from '../../src/application/services';
import { empty, MemoryStorage, mutex, reviewed } from './storage-support';
import type { Sources } from '../../src/domain/storage/schema';

export const token = (value: number) => value.toString(16).padStart(64, '0');
export const identity = {
  id: 'synthetic-extension',
  root: 'chrome-extension://synthetic-extension/',
};
export const sender = (page: string) => ({
  id: identity.id,
  url: identity.root + page,
  tab: { id: 900, windowId: 1, incognito: false },
});

export class FakeBrowser implements RunnerPort, ServicePlatform {
  time = 1_800_000_000_000;
  session = token(999);
  alarmFailure = false;
  wakes: number[] = [];
  delays: number[] = [];
  created: {
    url: string;
    windowId: number | null;
    tabId: number;
    time: number;
  }[] = [];
  activated: number[] = [];
  navigated: { id: number; url: string }[] = [];
  menu: MenuItem[] = [];
  captures: { scope: string; windowId: number }[] = [];
  captured = { urls: ['https://captured.example.test/'], skipped: 0 };
  tabs = new Map<
    number,
    {
      id: number;
      url: string;
      active: boolean;
      focused: boolean;
      incognito: boolean;
    }
  >();
  createHook:
    ((url: string, windowId: number | null) => Promise<number>) | null = null;
  targetHook: ((id: number | null) => Promise<number>) | null = null;
  private owned = false;
  now = () => this.time;
  sessionId = () => Promise.resolve(this.session);
  sleep = (milliseconds: number) => {
    this.delays.push(milliseconds);
    this.time += milliseconds;
    return Promise.resolve();
  };
  own = async (work: () => Promise<void>) => {
    if (this.owned) return;
    this.owned = true;
    try {
      await work();
    } finally {
      this.owned = false;
    }
  };
  ensureAlarm = () =>
    this.alarmFailure
      ? Promise.reject(new Error('alarm unavailable'))
      : Promise.resolve();
  wake = (milliseconds: number) => {
    this.wakes.push(milliseconds);
  };
  idleClears = 0;
  idle = () => {
    this.idleClears++;
    return Promise.resolve();
  };
  createTab = (url: string, windowId: number | null): Promise<number> => {
    if (this.createHook) return this.createHook(url, windowId);
    const tabId = this.created.length + 10;
    this.created.push({ url, windowId, tabId, time: this.time });
    this.tabs.set(tabId, {
      id: tabId,
      url,
      active: false,
      focused: true,
      incognito: false,
    });
    return Promise.resolve(tabId);
  };
  activateTab = (tabId: number) => {
    this.activated.push(tabId);
    return Promise.resolve();
  };
  deferredUrl = (job: string, index: number) =>
    identity.root + 'deferred.html?job=' + job + '&index=' + String(index);
  targetWindow = (id: number | null) =>
    this.targetHook ? this.targetHook(id) : Promise.resolve(id ?? 1);
  allowTransmission = () => Promise.resolve();
  capture = (scope: 'currentWindow' | 'allOpenedTabs', windowId: number) => {
    this.captures.push({ scope, windowId });
    return Promise.resolve(this.captured);
  };
  tab = (id: number) => Promise.resolve(this.tabs.get(id)!);
  navigate = (id: number, url: string) => {
    this.navigated.push({ id, url });
    const tab = this.tabs.get(id);
    if (tab) tab.url = url;
    return Promise.resolve();
  };
  private deferredMutex = mutex();
  deferredLock = <T>(_id: number, work: () => Promise<T>) =>
    this.deferredMutex(work);
}
export async function sharedSetup(source: Sources = structuredClone(empty)) {
  const port = new MemoryStorage(source),
    lock = mutex();
  const storage = new StorageCoordinator(
    port,
    lock,
    () => '2026-11-01T12:00:00.000Z',
  );
  const review = await storage.prepare(source.localStorage);
  await storage.commit(source.localStorage, review, reviewed(review.plan));
  const browser = new FakeBrowser();
  const opening = new OpeningService(storage, browser.now, browser.sessionId);
  const runner = new OpeningRunner(storage, browser);
  const menus = new SavedListMenus(storage, {
    clear: () => {
      browser.menu = [];
      return Promise.resolve();
    },
    create: (item) => {
      browser.menu.push(item);
      return Promise.resolve();
    },
  });
  const services = new SharedServices(
    storage,
    opening,
    menus,
    browser,
    identity,
    () => undefined,
  );
  return {
    source,
    port,
    lock,
    storage,
    browser,
    opening,
    runner,
    menus,
    services,
    review,
  };
}
