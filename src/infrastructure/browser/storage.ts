import { browser } from 'wxt/browser';
import { StorageCoordinator } from '../../application/storage/coordinator';
import { MigrationError } from '../../domain/storage/errors';

export function createStorageCoordinator(
  jobSignal: () => Promise<void> = () => Promise.resolve(),
): StorageCoordinator {
  return new StorageCoordinator(
    {
      readLocal: () => browser.storage.local.get(null),
      readSync: () => browser.storage.sync.get(null),
      writeLocal: (values) => browser.storage.local.set(values),
    },
    async (work) => {
      if (!navigator.locks) throw new MigrationError('LOCK_UNAVAILABLE');
      return navigator.locks.request(
        'buo-v2-storage-writer',
        { mode: 'exclusive' },
        work,
      );
    },
    undefined,
    jobSignal,
  );
}
