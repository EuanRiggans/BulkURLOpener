import { describe, expect, it } from 'vitest';
import { createPageUrl } from '../../src/shared/extension-pages';
import type { ExtensionPage } from '../../src/shared/extension-pages';

describe('internal extension navigation', () => {
  for (const root of [
    'chrome-extension://example-id/',
    'moz-extension://example-uuid/',
  ]) {
    it(`keeps page navigation on ${new URL(root).protocol}`, () => {
      const result = new URL(createPageUrl(root, '/new-list.html'));
      expect(result.protocol).toBe(new URL(root).protocol);
      expect(result.host).toBe(new URL(root).host);
      expect(result.pathname).toBe('/new-list.html');
    });
  }
  it('preserves zero as a list identity', () => {
    const result = new URL(
      createPageUrl('moz-extension://example/', '/edit-list.html', { id: 0 }),
    );
    expect(result.searchParams.get('id')).toBe('0');
  });
  it('round-trips reserved characters and Unicode in parameters', () => {
    const value = 'A & B # résumé ? x=%26';
    const result = new URL(
      createPageUrl('chrome-extension://example/', '/edit-list.html', {
        value,
      }),
    );
    expect(result.searchParams.get('value')).toBe(value);
    expect(result.hash).toBe('');
    expect([...result.searchParams.keys()]).toEqual(['value']);
  });
  it('rejects ordinary websites as extension roots', () => {
    expect(() => createPageUrl('https://example.test/', '/popup.html')).toThrow(
      'extension origin',
    );
  });
  it('rejects an external page supplied from untyped code', () => {
    expect(() =>
      createPageUrl(
        'chrome-extension://example/',
        'https://example.test/' as ExtensionPage,
      ),
    ).toThrow('Unknown extension page');
  });
  it('rejects traversal outside the known page routes', () => {
    expect(() =>
      createPageUrl(
        'moz-extension://example/',
        '/../private.json' as ExtensionPage,
      ),
    ).toThrow('Unknown extension page');
  });
});
