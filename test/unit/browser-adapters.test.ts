import { heldJobs } from '../../src/infrastructure/browser/held-jobs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({
  runtime: {
    lastError: undefined as { message: string } | undefined,
    getURL: (path: string) => 'chrome-extension://synthetic-extension' + path,
  },
  windows: { get: vi.fn(), getLastFocused: vi.fn(), getAll: vi.fn() },
  tabs: { query: vi.fn(), get: vi.fn(), update: vi.fn() },
  permissions: { getAll: vi.fn(), request: vi.fn() },
  contextMenus: { create: vi.fn(), removeAll: vi.fn(), remove: vi.fn() },
  alarms: { get: vi.fn(), create: vi.fn() },
}));
vi.mock('wxt/browser', () => ({ browser: native }));
import {
  browserMenuPort,
  normalWindow,
  scopedWindow,
  startupWindow,
  requireTransmissionConsent,
  prepareOpeningRecovery,
} from '../../src/infrastructure/browser/opening';
import {
  browserServicePlatform,
  createBrowserServicePlatform,
} from '../../src/infrastructure/browser/services';

describe('native browser API adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.runtime.lastError = undefined;
    native.alarms.create.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('refuses a private or missing target instead of falling back to another window', async () => {
    native.windows.get.mockResolvedValueOnce({ id: 5, incognito: true });
    await expect(normalWindow(5)).rejects.toThrow('WINDOW_SCOPE_MISMATCH');
    native.windows.get.mockRejectedValueOnce(new Error('window closed'));
    await expect(normalWindow(5)).rejects.toThrow('NO_TARGET_WINDOW');
    expect(native.windows.getLastFocused).not.toHaveBeenCalled();
  });
  it('uses the focused normal window for startup and waits if only private windows exist', async () => {
    native.windows.getAll.mockResolvedValueOnce([
      { id: 1, incognito: true, focused: true },
      { id: 2, incognito: false, focused: false },
    ]);
    expect(await startupWindow(null)).toBe(2);
    native.windows.getAll.mockResolvedValueOnce([
      { id: 1, incognito: true, focused: true },
    ]);
    await expect(startupWindow(null)).rejects.toThrow('NO_TARGET_WINDOW');
  });
  it('allows a private target only in private scope and captures only private tab URLs', async () => {
    native.windows.get.mockResolvedValueOnce({ id: 5, incognito: true });
    expect(await scopedWindow(5, true)).toBe(5);
    native.windows.get.mockResolvedValueOnce({ id: 6, incognito: false });
    await expect(scopedWindow(6, true)).rejects.toThrow(
      'WINDOW_SCOPE_MISMATCH',
    );
    native.tabs.query.mockResolvedValueOnce([
      { url: 'https://regular.example.test/', incognito: false },
      { url: 'https://private.example.test/', incognito: true },
    ]);
    expect(
      await createBrowserServicePlatform(true).capture('allOpenedTabs', 5),
    ).toEqual({ urls: ['https://private.example.test/'], skipped: 1 });
  });
  it('omits private and inaccessible tab URLs and reports their count', async () => {
    native.tabs.query.mockResolvedValue([
      { url: 'https://normal.example.test/', incognito: false },
      { url: 'https://private.example.test/', incognito: true },
      { incognito: false },
    ]);
    expect(await browserServicePlatform.capture('currentWindow', 4)).toEqual({
      urls: ['https://normal.example.test/'],
      skipped: 2,
    });
    expect(native.tabs.query).toHaveBeenCalledWith({ windowId: 4 });
    await browserServicePlatform.capture('allOpenedTabs', 4);
    expect(native.tabs.query).toHaveBeenLastCalledWith({});
  });
  it('awaits callback completion for menu APIs and observes runtime.lastError', async () => {
    vi.stubEnv('FIREFOX', 'true');
    native.contextMenus.create.mockImplementation(
      (item: { id: string }, callback: () => void) => {
        callback();
        return item.id;
      },
    );
    native.contextMenus.removeAll.mockImplementation((callback: () => void) =>
      callback(),
    );
    await browserMenuPort.create({ id: 'root', title: 'Bulk URL Opener' });
    expect(native.contextMenus.create.mock.calls[0]?.[0]).toEqual({
      id: 'root',
      title: 'Bulk URL Opener',
      contexts: ['all'],
    });
    await browserMenuPort.clear();
    native.runtime.lastError = {
      message: 'private backend details should not escape',
    };
    await expect(
      browserMenuPort.create({ id: 'root', title: 'Example' }),
    ).rejects.toThrow('MENU_REFRESH_FAILED');
    await expect(browserMenuPort.clear()).rejects.toThrow(
      'MENU_REFRESH_FAILED',
    );
  });
  it('clears only the Chromium context root and accepts its expected absent state', async () => {
    vi.stubEnv('FIREFOX', '');
    native.contextMenus.remove.mockImplementation(
      (_id: string, done: () => void) => done(),
    );
    await browserMenuPort.clear();
    expect(native.contextMenus.remove).toHaveBeenCalledWith(
      'buo-root',
      expect.any(Function),
    );
    expect(native.contextMenus.removeAll).not.toHaveBeenCalled();
    native.runtime.lastError = {
      message: 'Cannot find menu item with id buo-root',
    };
    await expect(browserMenuPort.clear()).resolves.toBeUndefined();
    native.runtime.lastError = { message: 'Unknown API failure' };
    await expect(browserMenuPort.clear()).rejects.toThrow(
      'MENU_REFRESH_FAILED',
    );
  });
  it('checks Firefox data grants before establishing recoverable opening', async () => {
    vi.stubEnv('FIREFOX', 'true');
    native.permissions.getAll.mockResolvedValueOnce({
      data_collection: ['none'],
    });
    await expect(requireTransmissionConsent()).rejects.toThrow(
      'DATA_CONSENT_REQUIRED',
    );
    native.permissions.getAll.mockResolvedValue({
      data_collection: ['browsingActivity', 'searchTerms'],
    });
    native.alarms.get.mockResolvedValue(undefined);
    await prepareOpeningRecovery();
    expect(native.alarms.create).toHaveBeenCalledWith('buo-opening-recovery', {
      periodInMinutes: 0.5,
    });
  });
  it('supports the native alarm API when creation returns void instead of a Promise', async () => {
    vi.stubEnv('FIREFOX', 'true');
    native.permissions.getAll.mockResolvedValue({
      data_collection: ['browsingActivity', 'searchTerms'],
    });
    native.alarms.get.mockResolvedValueOnce(undefined);
    native.alarms.create.mockReturnValueOnce(undefined);
    await expect(prepareOpeningRecovery()).resolves.toBeUndefined();
  });
});

it('identifies pending helper navigations and unsettled tabs within the matching privacy scope', async () => {
  const job = 'a'.repeat(64);
  native.tabs.query.mockResolvedValueOnce([
    { id: 1, url: 'about:blank', incognito: false },
    {
      id: 2,
      url: 'about:blank',
      pendingUrl:
        'chrome-extension://synthetic-extension/deferred.html?job=' +
        job +
        '&index=0',
      incognito: false,
    },
    {
      id: 3,
      url:
        'chrome-extension://synthetic-extension/deferred.html?job=' +
        'b'.repeat(64) +
        '&index=0',
      incognito: true,
    },
  ]);
  expect(await heldJobs(false)).toEqual({ jobs: [job], unsettledTabs: [1] });
  native.tabs.query.mockRejectedValueOnce(new Error('unavailable'));
  expect(await heldJobs(false)).toBeNull();
});
