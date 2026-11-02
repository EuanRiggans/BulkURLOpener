import { browser } from 'wxt/browser';
import { privatePrefix } from '../../shared/storage-events';

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
export function observeWorkspace(
  changed: (changes: Changes, area: string) => void,
): () => void {
  const message = (raw: unknown, sender: { id?: string }) => {
    if (
      sender.id !== browser.runtime.id ||
      !raw ||
      typeof raw !== 'object' ||
      !('type' in raw) ||
      raw.type !== 'buo:private/changed' ||
      !('keys' in raw) ||
      !Array.isArray(raw.keys) ||
      !raw.keys.every(
        (key: unknown) =>
          typeof key === 'string' && key.startsWith(privatePrefix),
      )
    )
      return;
    const keys = raw.keys as string[];
    changed(Object.fromEntries(keys.map((key) => [key, {}])), 'session');
  };
  browser.storage.onChanged.addListener(changed);
  browser.runtime.onMessage.addListener(message);
  return () => {
    browser.storage.onChanged.removeListener(changed);
    browser.runtime.onMessage.removeListener(message);
  };
}
export function notifyPrivateChange(keys: string[]): void {
  // Keys only, no user values; runtime messages stay within the split context.
  void browser.runtime
    .sendMessage({ type: 'buo:private/changed', keys })
    .catch(() => undefined);
}
