import { browser } from 'wxt/browser';
import * as v from 'valibot';
import { jsonObjectSchema } from '../../domain/storage/json';
import { MigrationError, requireCondition } from '../../domain/storage/errors';
import { notifyPrivateChange } from './change-events';

type Store = Record<string, unknown>;
// Chromium shares storage.session across split extension contexts. Its private
// IndexedDB partition instead belongs to the incognito browser context: it
// survives worker suspension and the browser destroys it with that context.
export const privateDatabase = 'bulk-url-opener-private';
export function createIncognitoStore() {
  let connection: Promise<IDBDatabase> | null = null;
  function database(): Promise<IDBDatabase> {
    requireCondition(
      browser.extension.inIncognitoContext,
      'PRIVATE_ACCESS_REQUIRED',
    );
    connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(privateDatabase, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = request.onblocked = () =>
        reject(new MigrationError('PRIVATE_STORAGE_UNAVAILABLE'));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
    return connection;
  }
  async function transact<T>(
    mode: IDBTransactionMode,
    work: (store: Store) => T,
  ): Promise<T> {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('state', mode);
      const objectStore = transaction.objectStore('state');
      const request = objectStore.get('records');
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const raw: unknown = request.result;
          const store = v.parse(jsonObjectSchema, raw ?? {});
          result = work(store);
          if (mode === 'readwrite') objectStore.put(store, 'records');
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () =>
        reject(
          failure instanceof Error
            ? failure
            : new MigrationError('PRIVATE_STORAGE_UNAVAILABLE'),
        );
    });
  }
  return {
    read: () => transact('readonly', (store) => store),
    write: async (values: Store) => {
      await transact('readwrite', (store) => {
        Object.assign(store, values);
      });
      notifyPrivateChange(Object.keys(values));
    },
    remove: async (keys: string[]) => {
      await transact('readwrite', (store) => {
        for (const key of keys) delete store[key];
      });
      notifyPrivateChange(keys);
    },
  };
}
