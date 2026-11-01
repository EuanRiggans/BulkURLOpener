import { describe, expect, it } from 'vitest';
import { captureDocument } from '../../src/infrastructure/browser/migration-client';

function store(values: Record<string, string>): Storage {
  return {
    get length() {
      return Object.keys(values).length;
    },
    key: (index) => Object.keys(values)[index] ?? null,
    getItem: (key) => (Object.hasOwn(values, key) ? values[key]! : null),
    setItem: () => {
      throw new Error('Capture must not write.');
    },
    removeItem: () => {
      throw new Error('Capture must not remove.');
    },
    clear: () => {
      throw new Error('Capture must not clear.');
    },
  };
}
describe('document storage capture', () => {
  it('reads exact malformed and reserved values without changing the document store', () => {
    const values = JSON.parse(
      '{"settings":"{not json","maxID":"NaN","__proto__":"keep","constructor":"keep too","draft":"[\\"\\",\\"café\\"]"}',
    ) as Record<string, string>;
    expect(captureDocument(store(values))).toEqual(values);
  });
  it('rejects a key disappearing during enumeration', () => {
    const storage = store({ first: 'value' });
    storage.key = () => null;
    expect(() => captureDocument(storage)).toThrow('SOURCES_CHANGED');
  });
  it('rejects a value disappearing during capture', () => {
    const storage = store({ first: 'value' });
    storage.getItem = () => null;
    expect(() => captureDocument(storage)).toThrow('SOURCES_CHANGED');
  });
  it('detects changes between its two reads', () => {
    const storage = store({ first: 'value' });
    let count = 0;
    storage.getItem = () => String(count++);
    expect(() => captureDocument(storage)).toThrow('SOURCES_CHANGED');
  });
});
