import type { Settings } from '../storage/schema';

export type RejectionReason =
  | 'empty'
  | 'ignored-text'
  | 'extraction-failed'
  | 'blocked-scheme'
  | 'invalid-url'
  | 'duplicate';
export type Destination = { inputIndex: number; input: string; url: string };
export type RejectedEntry = {
  inputIndex: number;
  input: string;
  reason: RejectionReason;
};
export type OpeningPlan = {
  destinations: Destination[];
  rejected: RejectedEntry[];
};
const allowed = new Set([
  'http:',
  'https:',
  'ftp:',
  'file:',
  'chrome:',
  'edge:',
  'about:',
  'brave:',
  'opera:',
  'vivaldi:',
]);
const blocked = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'blob:',
  'filesystem:',
  'chrome-extension:',
  'moz-extension:',
  'view-source:',
  'intent:',
  'mailto:',
  'tel:',
  'sms:',
  'devtools:',
  'chrome-search:',
]);

export function destinationUrl(
  input: string,
): { url: string } | { reason: 'blocked-scheme' | 'invalid-url' | 'text' } {
  const value = input.trim();
  if (/[\u0000-\u001f\u007f]/.test(value)) return { reason: 'invalid-url' };
  // Test bare hosts first so localhost:8080 is not mistaken for a URL scheme.
  if (!/\s/.test(value) && !value.includes('://')) {
    try {
      const bare = new URL('https://' + value);
      if (
        !bare.username &&
        !bare.password &&
        (bare.hostname === 'localhost' ||
          bare.hostname.includes('.') ||
          bare.hostname.startsWith('['))
      )
        return { url: bare.href };
    } catch {
      /* Try an explicit scheme or the text policy below. */
    }
  }
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(value)?.[1]?.toLowerCase();
  if (
    scheme &&
    (blocked.has(scheme) ||
      value.slice(scheme.length).startsWith('//') ||
      allowed.has(scheme))
  ) {
    if (!allowed.has(scheme)) return { reason: 'blocked-scheme' };
    try {
      if (
        [
          'http:',
          'https:',
          'ftp:',
          'file:',
          'chrome:',
          'edge:',
          'brave:',
          'opera:',
          'vivaldi:',
        ].includes(scheme) &&
        !value.slice(scheme.length).startsWith('//')
      )
        return { reason: 'invalid-url' };
      const url = new URL(value);
      if (['http:', 'https:', 'ftp:'].includes(scheme) && !url.hostname)
        return { reason: 'invalid-url' };
      if (scheme === 'about:' && !url.pathname)
        return { reason: 'invalid-url' };
      return { url: url.href };
    } catch {
      return { reason: 'invalid-url' };
    }
  }
  return { reason: 'text' };
}

export function extractFirstUrl(text: string): string | null {
  const matches = text.matchAll(
    /(?:https?|ftp|file):\/\/[^\s<>"']+|www\.[^\s<>"']+|localhost(?::\d+)?(?:[/?#][^\s<>"']*)?/gi,
  );
  for (const match of matches) {
    let candidate = match[0];
    const opens = candidate.match(/\(/g)?.length ?? 0;
    let closes = candidate.match(/\)/g)?.length ?? 0;
    while (candidate.endsWith(')') && closes > opens) {
      candidate = candidate.slice(0, -1);
      closes--;
    }
    const result = destinationUrl(candidate);
    if ('url' in result) return result.url;
  }
  return null;
}

export function planOpening(
  lines: readonly string[],
  settings: Settings,
): OpeningPlan {
  const plan: OpeningPlan = { destinations: [], rejected: [] };
  const seen = new Set<string>();
  lines.forEach((input, inputIndex) => {
    const value = input.trim();
    let result: { url: string } | { reason: RejectionReason | 'text' } = value
      ? destinationUrl(value)
      : { reason: 'empty' };
    if ('reason' in result && result.reason === 'text') {
      if (settings.nonUrlHandler === 'ignoreString')
        result = { reason: 'ignored-text' as const };
      else if (settings.nonUrlHandler === 'attemptToExtractURL') {
        const url = extractFirstUrl(value);
        result = url ? { url } : { reason: 'extraction-failed' as const };
      } else {
        const base = {
          googleEngine: 'https://www.google.com/search',
          duckduckgoEngine: 'https://duckduckgo.com/',
          bingEngine: 'https://www.bing.com/search',
        }[settings.searchEngine];
        const search = new URL(base);
        search.searchParams.set('q', value);
        result = { url: search.href };
      }
    }
    if ('url' in result) {
      if (settings.automaticallyRemoveDuplicateUrls && seen.has(result.url))
        plan.rejected.push({ inputIndex, input, reason: 'duplicate' });
      else {
        seen.add(result.url);
        plan.destinations.push({ inputIndex, input, url: result.url });
      }
    } else
      plan.rejected.push({
        inputIndex,
        input,
        reason: result.reason as RejectionReason,
      });
  });
  if (settings.openUrlsInReverseOrder) plan.destinations.reverse();
  return plan;
}
