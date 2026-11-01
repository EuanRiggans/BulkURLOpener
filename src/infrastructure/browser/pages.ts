import { browser } from 'wxt/browser';
import { createPageUrl } from '../../shared/extension-pages';
import type {
  ExtensionPage,
  PageParameters,
} from '../../shared/extension-pages';

export function pageUrl(
  page: ExtensionPage,
  parameters?: PageParameters,
): string {
  return createPageUrl(browser.runtime.getURL('/'), page, parameters);
}
