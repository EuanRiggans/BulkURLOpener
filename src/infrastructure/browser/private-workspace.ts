import { browser } from 'wxt/browser';
import { SessionWorkspace } from '../../application/storage/session-workspace';
import type { StorageCoordinator } from '../../application/storage/coordinator';
import { requireCondition } from '../../domain/storage/errors';
import { newRequestId } from '../../shared/ids';
import {
  ensureRecoveryAlarm,
  privateRecoveryAlarm,
  privateDueAlarm,
} from './opening';

export function createPrivateWorkspace(
  regular: StorageCoordinator,
): SessionWorkspace {
  return new SessionWorkspace(
    {
      read: () => browser.storage.session.get(null),
      write: (values) => browser.storage.session.set(values),
      remove: (keys) => browser.storage.session.remove(keys),
      windows: async () =>
        (await browser.windows.getAll())
          .filter((window) => window.incognito && window.id !== undefined)
          .map((window) => window.id!),
      exclusive: async (work) => {
        requireCondition(navigator.locks, 'LOCK_UNAVAILABLE');
        return navigator.locks.request(
          'buo-v2-private-storage-writer',
          { mode: 'exclusive' },
          work,
        );
      },
      token: newRequestId,
      now: () => new Date().toISOString(),
      signal: () => ensureRecoveryAlarm(true),
      idle: async () => {
        await Promise.all([
          browser.alarms.clear(privateRecoveryAlarm),
          browser.alarms.clear(privateDueAlarm),
        ]);
      },
    },
    regular,
  );
}
