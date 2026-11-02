import * as v from 'valibot';
import { browser } from 'wxt/browser';
import { extensionRequest } from '../../infrastructure/browser/client';
import { workspaceSchema, type Workspace } from '../../domain/workspace-schema';
import { type MutationInput, statusSchema } from '../../domain/storage/schema';

export const readWorkspace = () =>
  extensionRequest(
    { type: 'buo:service/workspace.read', windowId: targetWindow() },
    workspaceSchema,
  );
export const mutate = (input: MutationInput) =>
  extensionRequest({ type: 'buo:service/library.mutate', input }, statusSchema);
const captureSchema = v.strictObject({
  lines: v.array(v.string()),
  skipped: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
});
export function targetWindow(): number | null {
  const value = new URLSearchParams(location.search).get('window');
  return value !== null &&
    /^(0|[1-9]\d*)$/.test(value) &&
    Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}
export const captureTabs = () =>
  extensionRequest(
    { type: 'buo:service/capture', windowId: targetWindow() },
    captureSchema,
  );
export function openPage(url: string): Promise<unknown> {
  const windowId = targetWindow();
  return browser.tabs.create({
    url,
    ...(windowId === null ? {} : { windowId }),
  });
}
export function confirmedActive(
  result: v.InferOutput<typeof statusSchema>,
): Pick<Workspace, 'head' | 'data'> {
  if (!result.head || !result.data) throw new Error('MIGRATION_REQUIRED');
  return { head: result.head, data: result.data };
}
export function downloadText(
  text: string,
  name: string,
  type = 'application/json',
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error('CLIPBOARD_UNAVAILABLE');
  }
}
