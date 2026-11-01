// Only bundled internal pages belong in this route set.
export const extensionPages = [
  '/popup.html',
  '/options.html',
  '/new-list.html',
  '/edit-list.html',
] as const;

export type ExtensionPage = (typeof extensionPages)[number];
export type PageParameters = Readonly<Record<string, string | number>>;

export function createPageUrl(
  extensionRoot: string,
  page: ExtensionPage,
  parameters: PageParameters = {},
): string {
  const root = new URL(extensionRoot);
  if (!['chrome-extension:', 'moz-extension:'].includes(root.protocol)) {
    throw new Error('An extension origin is required for internal navigation.');
  }
  if (!extensionPages.includes(page))
    throw new Error('Unknown extension page.');
  const destination = new URL(page, root);
  for (const [key, value] of Object.entries(parameters)) {
    destination.searchParams.set(key, String(value));
  }
  return destination.href;
}
