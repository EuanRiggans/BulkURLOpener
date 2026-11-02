import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({
  extension: { inIncognitoContext: false },
  runtime: {
    id: 'synthetic',
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
}));
vi.mock('wxt/browser', () => ({ browser: native }));
import { createIncognitoStore } from '../../src/infrastructure/browser/incognito-store';
import { observeWorkspace } from '../../src/infrastructure/browser/change-events';

afterEach(() => {
  native.extension.inIncognitoContext = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('refuses every private database operation before opening a regular partition', async () => {
  const open = vi.fn();
  vi.stubGlobal('indexedDB', { open });
  const store = createIncognitoStore();
  await expect(store.read()).rejects.toThrow('PRIVATE_ACCESS_REQUIRED');
  await expect(
    store.write({ 'buo:private:v1:example': 'synthetic input' }),
  ).rejects.toThrow('PRIVATE_ACCESS_REQUIRED');
  await expect(store.remove(['buo:private:v1:example'])).rejects.toThrow(
    'PRIVATE_ACCESS_REQUIRED',
  );
  expect(open).not.toHaveBeenCalled();
});

it('retains a malformed private database root instead of initializing over it', async () => {
  native.extension.inIncognitoContext = true;
  const put = vi.fn();
  type Request = { result: unknown; onsuccess?: () => void };
  type Transaction = {
    onabort?: () => void;
    oncomplete?: () => void;
    abort(): void;
    objectStore(): unknown;
  };
  const db = {
    transaction: () => {
      let aborted = false;
      const transaction: Transaction = {
        abort: () => {
          aborted = true;
          queueMicrotask(() => transaction.onabort?.());
        },
        objectStore: () => ({
          put,
          get: () => {
            const request: Request = { result: null };
            queueMicrotask(() => {
              request.onsuccess?.();
              if (!aborted) transaction.oncomplete?.();
            });
            return request;
          },
        }),
      };
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request: Request = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  const store = createIncognitoStore();
  await expect(store.read()).rejects.toThrow('PRIVATE_SESSION_INVALID');
  await expect(
    store.write({ 'buo:private:v1:replacement': 'must not overwrite' }),
  ).rejects.toThrow('PRIVATE_SESSION_INVALID');
  expect(put).not.toHaveBeenCalled();
});

it('accepts authenticated private change keys without copying message values and unsubscribes', () => {
  const changed = vi.fn();
  const stop = observeWorkspace(changed);
  const listener = native.runtime.onMessage.addListener.mock.calls[0]?.[0] as (
    raw: unknown,
    sender: { id: string },
  ) => void;
  const message = {
    type: 'buo:private/changed',
    keys: ['buo:private:v1:buo:v2:head'],
    values: { private: 'must not enter the event' },
  };
  listener(message, { id: 'foreign' });
  listener({ ...message, keys: ['arbitrary-key'] }, { id: 'synthetic' });
  expect(changed).not.toHaveBeenCalled();
  listener(message, { id: 'synthetic' });
  expect(changed).toHaveBeenCalledExactlyOnceWith(
    { 'buo:private:v1:buo:v2:head': {} },
    'session',
  );
  stop();
  expect(native.runtime.onMessage.removeListener).toHaveBeenCalledWith(
    listener,
  );
  expect(native.storage.onChanged.removeListener).toHaveBeenCalledWith(changed);
});
