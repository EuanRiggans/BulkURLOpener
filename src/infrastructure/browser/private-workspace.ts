import { heldJobs } from './held-jobs';
import { browser } from 'wxt/browser';
import { SessionWorkspace } from '../../application/storage/session-workspace';
import type { StorageCoordinator } from '../../application/storage/coordinator';
import { requireCondition } from '../../domain/storage/errors';
import { newRequestId } from '../../shared/ids';
import { createIncognitoStore } from './incognito-store';
import {
  ensureRecoveryAlarm,
  privateRecoveryAlarm,
  privateDueAlarm,
} from './opening';

export function createPrivateWorkspace(
  regular: StorageCoordinator,
): SessionWorkspace {
  const store = import.meta.env.FIREFOX
    ? {
        read: () => browser.storage.session.get(null),
        write: (values: Record<string, unknown>) =>
          browser.storage.session.set(values),
        remove: (keys: string[]) => browser.storage.session.remove(keys),
      }
    : createIncognitoStore();
  return new SessionWorkspace(
    {
      ...store,
      heldJobs: () => heldJobs(true),
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
