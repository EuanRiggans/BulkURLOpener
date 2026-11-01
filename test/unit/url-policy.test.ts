import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/domain/storage/migrate';
import {
  destinationUrl,
  extractFirstUrl,
  planOpening,
} from '../../src/domain/opening/urls';
import { hasTransmissionConsent } from '../../src/shared/data-consent';

describe('shared URL policy', () => {
  it.each([
    [
      'https://example.test/a?q=%2526#part',
      'https://example.test/a?q=%2526#part',
    ],
    ['http://localhost:8080/a', 'http://localhost:8080/a'],
    ['localhost:8080/a', 'https://localhost:8080/a'],
    ['www.example.test', 'https://www.example.test/'],
    ['192.168.1.20:8080/a', 'https://192.168.1.20:8080/a'],
    ['[::1]:8080/a', 'https://[::1]:8080/a'],
    ['https://example.test/café', 'https://example.test/caf%C3%A9'],
    ['ftp://files.example.test/a', 'ftp://files.example.test/a'],
    ['file:///tmp/example.txt', 'file:///tmp/example.txt'],
    ['chrome://settings/', 'chrome://settings/'],
    ['about:blank', 'about:blank'],
    ['edge://settings/', 'edge://settings/'],
  ])('preserves intended schemes and encoding: %s', (input, url) => {
    expect(destinationUrl(input)).toEqual({ url });
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'vbscript:msgbox(1)',
    'blob:https://example.test/123',
    'moz-extension://other/page.html',
    'chrome-extension://other/options.html',
    'intent://something',
    'mailto:someone@example.test',
    'custom://host/path',
  ])(
    'blocks unsafe or unsupported schemes instead of searching or rewriting: %s',
    (input) => {
      expect(planOpening([input], defaultSettings)).toMatchObject({
        destinations: [],
        rejected: [{ reason: 'blocked-scheme' }],
      });
    },
  );
  it.each([
    'https://',
    'http:example.test',
    'https://exa mple.test',
    'java\tscript:alert(1)',
  ])('reports malformed URL input explicitly: %s', (input) => {
    expect(planOpening([input], defaultSettings).rejected[0]?.reason).toBe(
      'invalid-url',
    );
  });
  it.each(['googleEngine', 'duckduckgoEngine', 'bingEngine'] as const)(
    'encodes search query values safely over HTTPS: %s',
    (searchEngine) => {
      const phrase = 'café & x=1 #tag %25';
      const result = planOpening([phrase], {
        ...defaultSettings,
        searchEngine,
      });
      const url = new URL(result.destinations[0]!.url);
      expect(url.protocol).toBe('https:');
      expect(url.searchParams.get('q')).toBe(phrase);
      expect([...url.searchParams.keys()]).toEqual(['q']);
      expect(url.hash).toBe('');
    },
  );
  it('retains search operators rather than treating them as external protocols', () => {
    const result = planOpening(
      ['site:example.test title', 'notes: meeting'],
      defaultSettings,
    );
    expect(
      result.destinations.map((entry) =>
        new URL(entry.url).searchParams.get('q'),
      ),
    ).toEqual(['site:example.test title', 'notes: meeting']);
  });
  it('applies ignore and extraction without the legacy HTTP-prefix fallback', () => {
    expect(
      planOpening(['plain text'], {
        ...defaultSettings,
        nonUrlHandler: 'ignoreString',
      }).rejected[0]?.reason,
    ).toBe('ignored-text');
    const result = planOpening(
      ['Read (http://localhost:8080/a?x=%2526) now', 'nothing here'],
      { ...defaultSettings, nonUrlHandler: 'attemptToExtractURL' },
    );
    expect(result.destinations[0]?.url).toBe('http://localhost:8080/a?x=%2526');
    expect(result.rejected[0]?.reason).toBe('extraction-failed');
    expect(
      extractFirstUrl(
        'one https://one.example.test/a two https://two.example.test/',
      ),
    ).toBe('https://one.example.test/a');
  });
  it('deduplicates normalized destinations before reversing while reporting every omitted input', () => {
    const input = [
      '  https://one.example.test  ',
      '',
      'https://one.example.test/',
      'https://two.example.test/?x=%2526',
      '   ',
    ];
    const saved = [...input];
    const plan = planOpening(input, {
      ...defaultSettings,
      automaticallyRemoveDuplicateUrls: true,
      openUrlsInReverseOrder: true,
    });
    expect(plan.destinations.map((entry) => entry.url)).toEqual([
      'https://two.example.test/?x=%2526',
      'https://one.example.test/',
    ]);
    expect(plan.rejected.map((entry) => entry.reason)).toEqual([
      'empty',
      'duplicate',
      'empty',
    ]);
    expect(input).toEqual(saved);
  });
  it('keeps duplicates when disabled and handles empty input safely', () => {
    expect(
      planOpening(
        ['https://example.test/', 'https://example.test/'],
        defaultSettings,
      ).destinations,
    ).toHaveLength(2);
    expect(planOpening([], defaultSettings)).toEqual({
      destinations: [],
      rejected: [],
    });
  });
  it('requires both declared Firefox data categories and rejects malformed grants', () => {
    expect(
      hasTransmissionConsent({
        data_collection: ['browsingActivity', 'searchTerms'],
      }),
    ).toBe(true);
    for (const value of [
      null,
      {},
      { data_collection: ['none'] },
      { data_collection: ['browsingActivity'] },
      { data_collection: 'searchTerms' },
    ])
      expect(hasTransmissionConsent(value)).toBe(false);
  });
});
