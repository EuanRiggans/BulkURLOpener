# Legacy storage fixture catalogue

These are **synthetic, non-personal test data**, based on inspected source. They
are not exports from the user's browser, and the earlier chat's files were not
recovered. URLs use reserved `.test` domains. Tests never contact them.

The current source baseline is
`4eb346d3bca8a12e6fa0f7e5ba891fcb711d9bf7`. Profile fixtures contain `_fixture`
provenance plus `localStorage`, `storageLocal` and `storageSync`. The first store
is a map of **raw strings**, including invalid values; extension storage uses
structured JSON values. Do not parse/re-serialize the whole raw map when backing
it up. Preserve exact values before conversion, including malformed records.

| Fixture | Purpose |
| --- | --- |
| `default-settings.json` | Exact current browser defaults, including `defaultBoostrap` and numeric booleans. This is a settings object, not a profile envelope. |
| `export-v1.json` | Legacy `{maxID, lists, settings}` export. This is a direct payload, not a profile envelope. |
| `zero-id-export.json` | Independently constructed export with numeric IDs 0/1, a string counter, and default/startup references to ID 0. All names, destinations and content are synthetic. |
| `current-profile.json` | UUID list keys; all 17 preferences; complex URL encoding, Unicode and duplicates; drafts and queue/new-list staging; nested snapshot; matching mirrors and serialized sync. |
| `numeric-profile.json` | Numeric JSON list keys and older settings missing later fields. Both historical saves and current imports can produce numeric keys. |
| `pre-json-profile.json` | `listStorage,...` and `settings,...` comma strings actually written by older versions, with an intentionally ambiguous comma-containing record. |
| `pre-marker-profile.json` | Still older ID-first comma strings, before the `listStorage` marker. |
| `conflicting-mirrors.json` | Same numeric list ID with different content, a mirror-only list, settings disagreement and a separate sync copy. No source is declared newest. |
| `mirror-only-profile.json` | Empty document storage with valid worker mirrors; defaults must not overwrite recoverable content. |
| `damaged-profile.json` | Invalid JSON, `undefined`, `NaN`, duplicate identities, unknown data/settings, empty list/name, bad timestamp and malformed nested backup. Raw values need recovery/quarantine. |

## Historical evidence

Before JSON, `localStorage.setItem(id, array)` coerced an array to its comma-joined
string; the old reader used `split(',')`. The records were not persisted as JavaScript
arrays or JSON arrays. See:

- [842a842, js/lists.js](https://github.com/EuanRiggans/BulkURLOpener/blob/842a842/js/lists.js#L1): list/settings writes at lines 1 and 8; reader at line 15.
- [842a842, js/newlist.js](https://github.com/EuanRiggans/BulkURLOpener/blob/842a842/js/newlist.js#L20): marker, numeric ID, name, then URL fields.
- [842a842, js/settings.js](https://github.com/EuanRiggans/BulkURLOpener/blob/842a842/js/settings.js#L21): `settings` marker followed by delay.
- [53596c1, js/newlist.js](https://github.com/EuanRiggans/BulkURLOpener/blob/53596c1/js/newlist.js#L17): older ID-first array; reader in `js/lists.js:8`.
- [4f511a4, app/js/utility.js](https://github.com/EuanRiggans/BulkURLOpener/blob/4f511a4/app/js/utility.js#L260): numeric-key JSON saves before UUID-key saving.

Literal commas in names or URLs destroy the distinction between a field
separator and content in these old formats. A converter cannot always reconstruct
the original intent. Keep the raw record, identify ambiguity and offer recovery;
do not claim a lossless automatic conversion in those cases. Lists from all
historic origins also need settings/default/startup reference remapping.

## How the fixtures are checked

The executable legacy baseline was retired with the replaced implementation in
Phase 6. Its 49 observations remain at
[the Phase 5 checkpoint](https://github.com/EuanRiggans/BulkURLOpener/tree/daaf7b0ccbf0381a33ff566f7d565a98c2f1b10a/test/characterization),
including defects that the replacement deliberately corrects.

`npm run test:unit` exercises the maintained migration/recovery, transfer and
service tests against these raw values. Those tests verify reconciliation,
explicit choices for ambiguous comma records, zero-ID references, quota/fault
recovery and retained original records. The JSON fixtures remain unchanged by
cleanup. Add fixtures for newly discovered installed-profile representations
and keep their provenance explicit; do not reintroduce the retired runtime.

Do not copy actual user exports or their list names/URLs into public fixtures.
The zero-ID case tests valid legacy semantics without retaining personal content;
zero must not be rejected by a truthiness check or confused with an unset ID.
