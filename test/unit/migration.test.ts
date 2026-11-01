import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  analyzeSources,
  createCandidate,
} from '../../src/domain/storage/migrate';
import { digest, stableJson } from '../../src/domain/storage/json';
import { sourcesSchema } from '../../src/domain/storage/schema';
import { empty, legacyExport, profile, reviewed } from './storage-support';

describe('legacy migration', () => {
  it('preserves current lists, all preferences, Unicode, URL bytes, duplicates, draft lines and staged input', async () => {
    const source = profile('current-profile');
    const plan = await analyzeSources(source);
    const data = createCandidate(plan, reviewed(plan));
    expect(plan.issues).toEqual([]);
    expect(data.lists).toHaveLength(2);
    expect(Object.keys(data.settings)).toHaveLength(17);
    expect(data.settings).toMatchObject({
      tabCreationDelay: 0.2,
      nightMode: true,
      newTabsActive: true,
      openUrlsInReverseOrder: true,
      automaticallyRemoveDuplicateUrls: true,
      contextMenuEnabled: false,
    });
    expect(data.lists[0]!.lines).toEqual(
      (source.storageLocal.lists as { list_links: string[] }[])[0]!.list_links,
    );
    expect(data.draftLines).toEqual(
      JSON.parse(source.localStorage.previous_list_input!),
    );
    expect(data.recoveredInputs.map((item) => item.kind)).toEqual([
      'pending-opening',
      'new-list-draft',
    ]);
    expect(plan.archives.map((item) => item.kind)).toEqual([
      'snapshot',
      'sync',
    ]);
    expect(data.settings.defaultListOpen).toBe(
      data.lists.find((item) => item.legacyId === 2)!.id,
    );
    expect(data.settings.openOnLaunch).toBe(
      data.lists.find((item) => item.legacyId === 7)!.id,
    );
  });
  it('fills missing historical fields without replacing valid preferences', async () => {
    const plan = await analyzeSources(profile('numeric-profile'));
    const data = createCandidate(plan, reviewed(plan));
    expect(data.settings.tabCreationDelay).toBe(1);
    expect(data.settings.contextMenuEnabled).toBe(false);
    expect(data.lists).toHaveLength(2);
  });
  it('recovers mirror-only profiles before considering fresh defaults', async () => {
    const plan = await analyzeSources(profile('mirror-only-profile'));
    expect(createCandidate(plan, reviewed(plan))).toMatchObject({
      settings: {
        tabCreationDelay: 0.2,
        nightMode: true,
        contextMenuEnabled: false,
      },
    });
    expect(plan.lists).toHaveLength(2);
    expect(plan.issues.every((item) => item.code === 'mirror-only-list')).toBe(
      true,
    );
  });
  it('preserves zero IDs and remaps both default and startup references', async () => {
    const plan = await analyzeSources(legacyExport('zero-id-export'));
    const data = createCandidate(plan, reviewed(plan));
    const zero = data.lists.find((item) => item.legacyId === 0)!;
    expect(data.settings.defaultListOpen).toBe(zero.id);
    expect(data.settings.openOnLaunch).toBe(zero.id);
    expect(data.settings.tabCreationDelay).toBe(0);
  });
  it('accepts the legacy direct JSON export envelope through synthetic document storage', async () => {
    const plan = await analyzeSources(legacyExport('export-v1'));
    expect(createCandidate(plan, reviewed(plan)).lists).toHaveLength(2);
  });
  it('retains both conflicting list versions and mirror-only records, requiring settings choices', async () => {
    const plan = await analyzeSources(profile('conflicting-mirrors'));
    expect(plan.lists).toHaveLength(4);
    expect(plan.lists.filter((item) => item.legacyId === 2)).toHaveLength(2);
    expect(
      plan.preferences
        .find((item) => item.key === 'tabCreationDelay')!
        .options.map((item) => item.value),
    ).toEqual([0.2, 4]);
    expect(() =>
      createCandidate(plan, {
        acknowledgeIssues: false,
        preferences: {},
        historical: {},
      }),
    ).toThrow('REVIEW_REQUIRED');
    expect(() =>
      createCandidate(plan, {
        acknowledgeIssues: true,
        preferences: {},
        historical: {},
      }),
    ).toThrow('PREFERENCE_CHOICE_REQUIRED');
    const data = createCandidate(plan, reviewed(plan));
    expect(new Set(data.lists.map((item) => item.id)).size).toBe(4);
  });
  it.each(['pre-json-profile', 'pre-marker-profile'])(
    'requires an explicit choice for every reconstructed comma record: %s',
    async (name) => {
      const plan = await analyzeSources(profile(name));
      expect(plan.lists.every((item) => item.reconstructed)).toBe(true);
      expect(() =>
        createCandidate(plan, {
          acknowledgeIssues: true,
          preferences: {},
          historical: {},
        }),
      ).toThrow('HISTORICAL_REVIEW_REQUIRED');
      const decisions = reviewed(plan);
      const kept = createCandidate(plan, decisions);
      expect(kept.lists.length).toBe(plan.lists.length);
      decisions.historical = Object.fromEntries(
        plan.lists.map((item) => [item.id, 'archive-only']),
      );
      expect(createCandidate(plan, decisions).lists).toEqual([]);
      if (name === 'pre-json-profile')
        expect(kept.settings.tabCreationDelay).toBe(0.3);
    },
  );
  it('quarantines damaged records individually, preserves empty lists and reports dangling references', async () => {
    const plan = await analyzeSources(profile('damaged-profile'));
    const data = createCandidate(plan, reviewed(plan));
    expect(data.lists).toHaveLength(5);
    expect(data.lists.filter((item) => item.legacyId === 3)).toHaveLength(2);
    expect(data.lists.find((item) => item.legacyId === 4)).toMatchObject({
      name: '',
      lines: [],
    });
    expect(data.draftLines).toBeNull();
    expect(plan.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'invalid-setting',
        'invalid-counter',
        'unknown-setting',
        'invalid-draft',
        'unrecognized-record',
        'invalid-archive',
        'invalid-snapshot-time',
        'dangling-reference',
      ]),
    );
  });
  it('enables the basic context menu only for a genuinely empty fresh install', async () => {
    const plan = await analyzeSources(empty);
    expect(
      createCandidate(plan, reviewed(plan)).settings.contextMenuEnabled,
    ).toBe(true);
    const archiveOnly = { ...empty, storageSync: { user_settings: '{}' } };
    const prior = await analyzeSources(archiveOnly);
    expect(
      createCandidate(prior, reviewed(prior)).settings.contextMenuEnabled,
    ).toBe(false);
  });
  it('normalizes numeric strings, boolean values and the misspelled theme without dropping other preferences', async () => {
    const source = structuredClone(empty);
    source.localStorage.settings = JSON.stringify({
      tab_creation_delay: '0.125',
      night_mode: '1',
      context_menu_enabled: false,
      auto_load_into_textarea: true,
      custom_theme: 'defaultBoostrap',
    });
    const plan = await analyzeSources(source);
    expect(createCandidate(plan, reviewed(plan)).settings).toMatchObject({
      tabCreationDelay: 0.125,
      nightMode: true,
      contextMenuEnabled: false,
      autoLoadIntoTextarea: true,
      customTheme: 'defaultBootstrap',
    });
  });
  it('does not trim, validate as URLs, deduplicate or execute saved lines during migration', async () => {
    const source = structuredClone(empty);
    const lines = [
      '',
      '  search phrase  ',
      'javascript:alert(1)',
      'https://example.test/?q=%2526',
      'https://example.test/?q=%2526',
    ];
    source.localStorage['0'] = JSON.stringify({
      object_description: 'list_storage',
      list_id: 0,
      list_name: '<b>Keep text</b>',
      list_links: lines,
    });
    const plan = await analyzeSources(source);
    expect(createCandidate(plan, reviewed(plan)).lists[0]).toMatchObject({
      name: '<b>Keep text</b>',
      lines,
    });
  });
  it('rejects forged, extra or unavailable decisions', async () => {
    const plan = await analyzeSources(empty);
    const choices = reviewed(plan);
    choices.preferences.tabCreationDelay = '0'.repeat(64);
    expect(() => createCandidate(plan, choices)).toThrow(
      'PREFERENCE_CHOICE_REQUIRED',
    );
    choices.preferences = { unknown: '0'.repeat(64) };
    expect(() => createCandidate(plan, choices)).toThrow('INVALID_DECISIONS');
  });
  it('keeps internal list identities stable when storage enumeration order changes', async () => {
    const source = profile('current-profile');
    const reordered = {
      ...source,
      localStorage: Object.fromEntries(
        Object.entries(source.localStorage).reverse(),
      ),
    };
    expect(await analyzeSources(source)).toEqual(
      await analyzeSources(reordered),
    );
    expect(await digest(source)).toBe(await digest(reordered));
  });
  it('preserves reserved object keys exactly without prototype pollution', () => {
    const source = JSON.parse(
      '{"localStorage":{"__proto__":"raw prototype","constructor":"raw constructor","prototype":"raw value"},"storageLocal":{"__proto__":{"preserve":true}},"storageSync":{}}',
    ) as unknown;
    const parsed = v.parse(sourcesSchema, source);
    expect(stableJson(parsed)).toBe(stableJson(source));
    expect(Object.keys(parsed.localStorage)).toEqual([
      '__proto__',
      'constructor',
      'prototype',
    ]);
    expect(Object.prototype).not.toHaveProperty('preserve');
  });
  it('rejects cycles, sparse arrays and unsupported nesting without modifying the input', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    let deep: unknown = 'retained';
    for (let index = 0; index < 210; index++) deep = [deep];
    for (const value of [cycle, Array<string>(3), deep])
      expect(
        v.safeParse(sourcesSchema, {
          ...empty,
          storageLocal: { unsupported: value },
        }).success,
      ).toBe(false);
    expect(cycle.self).toBe(cycle);
  });
  it('does not activate a setting that refers to an excluded reconstructed list', async () => {
    const source = profile('pre-marker-profile');
    source.localStorage.settings = JSON.stringify({
      default_list_open: 1,
      open_on_launch: '1',
    });
    const plan = await analyzeSources(source);
    const choices = reviewed(plan);
    choices.historical = { [plan.lists[0]!.id]: 'archive-only' };
    expect(() => createCandidate(plan, choices)).toThrow(
      'REFERENCE_UNAVAILABLE',
    );
    for (const key of ['defaultListOpen', 'openOnLaunch']) {
      const preference = plan.preferences.find((item) => item.key === key)!;
      choices.preferences[key] = preference.options.find(
        (item) =>
          item.value === (key === 'defaultListOpen' ? 'current-tabs' : null),
      )!.id;
    }
    expect(createCandidate(plan, choices).lists).toEqual([]);
  });
  it('marks a foreign settings marker for review while retaining recognized preferences', async () => {
    const source = structuredClone(empty);
    source.localStorage.settings = JSON.stringify({
      object_description: 'unrecognized',
      tab_creation_delay: 0.75,
    });
    const plan = await analyzeSources(source);
    expect(plan.issues.map((item) => item.code)).toContain(
      'invalid-settings-marker',
    );
    expect(
      createCandidate(plan, reviewed(plan)).settings.tabCreationDelay,
    ).toBe(0.75);
  });
  it.each([undefined, NaN, Infinity, new Date(), new Map()])(
    'rejects non-JSON structured data rather than silently coercing it: %s',
    (value) => {
      expect(
        v.safeParse(sourcesSchema, {
          ...empty,
          storageLocal: { unreadable: value },
        }).success,
      ).toBe(false);
    },
  );
});
