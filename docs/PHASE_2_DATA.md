# Phase 2: Protect and migrate data

This is the historical Phase 2 record. Normal mutations, opening jobs and
current permission/privacy limits are documented in [Phase 3](PHASE_3_SERVICES.md).

Recorded 1 November 2026. This phase starts at
`b2dea29fac06fff27f2de521903cab1dbdfac3c6` on `redevelopment`. The legacy
application and synthetic historical fixtures remain unchanged.

## Implemented scope

The preview now has a local migration/recovery service and controls on the
settings page. Nothing migrates on installation, background startup or popup
opening. The user inspects and reviews data in settings before activating it.
The popup stays compact, and list creation/editing remain separate pages.
Batch opening, list CRUD, settings editing, automatic opening, context menus,
active sync and general import/restore flows remain later phases.

Only `storage` is added to the manifest. There are no host, tabs, context-menu,
offscreen, downloads or unlimited-storage permissions. The browser adapter
reads `storage.local` and the existing `storage.sync` cache, and writes only
namespaced local records. It never uploads sync data or edits legacy keys.
The fixed Firefox ID and browser capability floors from Phase 1 are retained.

Valibot 1.5.0 supplies runtime schemas without generated code/eval. It is pinned
alongside Preact. The existing self-only CSP and narrow reviewed Preact vendor
warning exception still apply; no new Mozilla warning is accepted.

## Source and module map

| File                                                                                      | Responsibility                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/domain/storage/json.ts`                                                              | Exact JSON validation, canonical comparison and SHA-256 fingerprints.                                        |
| `src/domain/storage/schema.ts`                                                            | Runtime schemas for sources, 17 preferences, lists, candidates, history and messages' result values.         |
| `src/domain/storage/migrate.ts`                                                           | Pure legacy interpretation, reconciliation and reviewed candidate construction.                              |
| `src/application/storage/coordinator.ts`                                                  | One serialized protocol for verified backups, staging, publication, retries, readiness, export and rollback. |
| `src/application/storage/protocol.ts`, `messages.ts`                                      | Strict message validation and authenticated options-page access.                                             |
| `src/infrastructure/browser/storage.ts`                                                   | Browser storage and origin-wide Web Locks adapter.                                                           |
| `src/infrastructure/browser/migration-client.ts`                                          | Double-read capture of document storage and validated request/reply handling.                                |
| `src/entrypoints/background.ts`                                                           | Synchronous listener registration; no eager data initialization.                                             |
| `src/ui/recovery/`                                                                        | Inspection, conflict choices, retained-data inventory, downloads and undo on the options page.               |
| `test/unit/migration*.test.ts`, `storage-coordinator.test.ts`, `document-capture.test.ts` | Historical migration, fault, concurrency and messaging evidence.                                             |

Legacy source references and representation provenance remain in
[the baseline](PHASE_0_BASELINE.md#storage-inventory-and-historical-evidence) and
[fixture catalogue](../test/fixtures/legacy/README.md).

## Exact source capture

An extension document reads `localStorage`; the Chromium service worker cannot
read it. The client takes two synchronous snapshots and rejects differences,
missing keys or disappearing values. It does not parse, normalize or write those
raw strings. The background reads both extension storage areas itself rather
than trusting a page to supply their contents.

The migration source envelope has `localStorage` (raw strings), `storageLocal`
and `storageSync` (structured JSON). All legacy keys, unknown fields, invalid
JSON, string counters, drafts, staging and nested snapshots are retained. New
`buo:v2:` records are excluded from the source backup to prevent recursive copies.
A requested recovery export includes **all** local keys, including new records
and malformed canonical metadata, for diagnosis and future restoration work.

Raw records use validation that preserves keys such as `__proto__`, `constructor`
and `prototype`. Valibot's ordinary `record()` intentionally drops those keys,
so it is not used for raw captures. Safe construction uses object entries rather
than merging user keys into prototypes. Non-finite numbers, non-JSON objects,
cycles, sparse arrays and nesting beyond 200 are rejected without replacement or
cleanup. Such unsupported structured values can also block JSON export; retain
a browser-profile backup if JSON cannot represent the source.

SHA-256 uses stable object-key ordering while preserving array order, duplicate
lines, Unicode, URL encoding, whitespace, trailing blank draft lines and exact
raw strings. Fingerprints detect content differences; they are not encryption
or authentication against someone who can rewrite the entire browser profile.
Backup timestamps are informational and never establish source precedence.

## Reconciliation rules

- Numeric-key and UUID-key JSON lists are both read. Safe integer legacy IDs,
  including zero and numeric strings, are recognized. New IDs use a fingerprint
  of legacy ID, name and lines. Different old IDs remain different lists.
  These are assigned identities: future edits must keep the assigned ID instead
  of recomputing it when the name or content changes.
- Exact copies of one list identity/content are coalesced with their provenance.
  Conflicting versions of the same old ID are both retained under distinct new
  IDs. Mirror-only lists are retained and identified for acknowledgement.
- Known settings are merged field by field. Valid values from an old partial
  record are not replaced wholesale with defaults. Numeric/boolean flag forms,
  fractional delay strings, theme spelling aliases and zero references normalize
  to the typed model. All 17 legacy preferences have explicit mappings.
- Different valid values for a preference require an explicit selection. Default
  and startup references are remapped to new IDs; a conflicting ID also requires
  choosing the intended list version. Missing references are reported and safely
  unset. No invalid reference can enter active state.
- Missing historical preferences receive displayed defaults. Invalid/unknown
  fields and unexpected markers produce findings and remain in the raw backup.
  The basic context-menu preference is true only for a genuinely empty fresh
  install. Existing false/zero values and old-profile missing-field defaults
  remain false. Menu functionality itself belongs to Phase 3.
  The snapshots-disabled preference is preserved for normal automatic snapshots;
  it does not suppress the mandatory backup before migration.
- Both comma formats are recognized, but every reconstructed list needs an
  explicit include/archive-only choice. The proposed split is shown. Literal
  commas are irreversibly ambiguous; no lossless reconstruction is claimed.
- Empty list names, empty lists, duplicate names/lines, search phrases and even
  unsafe destination strings are preserved as text. Migration never opens them.
  The shared opening service must apply its URL policy before execution later.
- Previous draft lines and readable new-list/opening staging survive in the
  canonical model. Staging is **recovery input**, not an automatically resumed job.
- Sync exports and nested snapshots are inventoried and preserved as archives.
  They never automatically resurrect lists or replace settings. General archive
  import/restore UI belongs with Phase 4 transfer/recovery flows. The recovery
  download already retains their full original content, including damaged entries.

Every reported issue must be acknowledged. Every conflicting preference and
reconstructed record must have a valid choice. A preference cannot reference a
reconstructed list that was excluded. The background recomputes the candidate
from the verified backup and decisions; it never accepts a page-supplied model.

## Persistence and publication protocol

Canonical storage schema version is **1**, independent of extension version
`2.0.0`. New records use this layout in `storage.local`:

| Key                             | Contents and mutability                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `buo:v2:backup:<source digest>` | Original source envelope, its digest and capture time; immutable after creation.              |
| `buo:v2:stage:<record digest>`  | Validated candidate, exact decisions, backup reference and expected previous head; immutable. |
| `buo:v2:state:<record digest>`  | Versioned data, revision, kind and history/recovery references; immutable.                    |
| `buo:v2:head`                   | Small active-state pointer and revision; written last.                                        |

The service has an in-memory queue and acquires an origin-wide exclusive Web
Lock. If locks are unavailable it refuses operations rather than substituting
an unsafe parallel writer. All future writers must use this same coordinator/
lock and verify the expected revision **inside** the mutation operation.
`requireActiveData()` provides verified read readiness; checking it once and
writing separately would not constitute a transaction.

1. Capture raw sources, write a source-addressed backup and read it back. Existing
   backups are verified and reused; conflicting immutable records are not overwritten.
2. Return the inventory and proposed values for review. No canonical data is
   active at this point.
3. Re-read extension sources and compare them and the fresh document capture to
   the inspected source digest. Reject a stale review.
4. Recompute and validate the reviewed candidate. Write/read back its immutable
   stage, then its immutable state. Verify the complete referenced record chain.
5. Recheck sources and the expected current head. Publish the head last, then
   read it and its complete data/recovery references back before reporting success.

The head is the completion marker. A stage or orphaned candidate alone never
enables active data. A missing/invalid referenced backup, stage, state, revision,
hash or list reference blocks readiness. An unknown managed key/version also
blocks migration rather than resetting to defaults.

If an acknowledgement is lost after the head write, an identical retry returns
the verified result without another revision. If interrupted before the head,
the original sources and partial records remain. A matching verified orphaned
candidate can be resumed; inspection restores its exact previously reviewed
choices for explicit confirmation. Unexplained/multiple orphan states or changed
sources do not trigger guessed recovery or initialization over those states.
Download their recovery evidence for deliberate recovery instead.

Undo writes another immutable state with a higher revision, verifies it and
publishes that pointer last. The first migration's previous active state is
absent, so undo makes the migrated model inactive and closes the readiness gate.
Original legacy stores, migrated records, backups and history remain. It does
not destructively write old values over document storage or sync. Re-inspection
can deliberately migrate again. Undo acknowledgement failures are retryable too.

## User flow and privacy

Use an isolated profile; do not install this preview over the normal add-on.
Keep the normal add-on installed and use profile copies for eventual upgrade
testing. In preview **Settings → Data protection and recovery**:

1. Close old extension pages. Download a recovery file before migration.
2. Select **Inspect and back up data**. Review retained lists and all preferences.
3. Choose conflicting values and how to handle every reconstructed comma record.
   Acknowledge findings, then select **Migrate reviewed data**.
4. Check the verified status. **Undo this migration** is available separately.

Downloads are user-requested JSON through a local Blob; no download permission,
server, analytics, remote font or automatic destination opening is introduced.
They contain private data and must be stored privately. Errors sent to the UI
are fixed codes, never raw exception messages or source contents. Raw values are
rendered as text, not HTML or navigable destination links. Public tests use only
synthetic fixtures and `.test` destinations.

Only a same-ID extension options page can invoke the migration protocol. Sender
ID alone is insufficient because it can also match content scripts; the handler
checks the exact extension protocol/host and `/options.html` path. Requests and
responses are runtime-validated. The listener uses `sendResponse` plus literal
`true`, which works on the Chromium 120 floor; WXT's browser object does not
polyfill older Chromium Promise-returning message listeners.

## Confirmed local evidence

- 106 modern Vitest tests and 49 unchanged legacy checks pass. These include all
  seven historical profiles and both direct export fixtures, zero IDs and remapped
  references, settings aliases, conflicts, damaged/unknown data, drafts and archives.
- Fault tests inject rejection before/after each write and acknowledged-but-dropped
  writes. They check unchanged originals, safe retries after a new coordinator
  instance, publication ordering and corruption detection.
- Shared-lock tests exercise identical and conflicting simultaneous requests;
  stale document/mirror/sync previews and source changes during staging are rejected.
- Rollback, rollback acknowledgement failures, invalid/future state, missing head,
  exact interrupted-choice resumption, reserved keys and read-only export on quota
  failure have explicit coverage.
- A larger synthetic profile migrates 300 lists/12,000 lines with a full-content
  source comparison. This is algorithmic evidence, not a browser performance claim.
- TypeScript, ESLint, formatting, both builds, generated-resource verification and
  Mozilla validation are required by `npm run validate` and hosted CI.
- The runtime dependency audit reports zero advisories. The full tooling audit
  remains 17 moderate/one low affected package entries, zero high/critical, as
  documented in Phase 1. No incompatible force-fix is applied.

A clean `npm ci` and the full validation pipeline also passed in a separate
directory without dependencies or generated types. All 52 generated resources
(26 per browser, including source maps) were byte-identical after that rebuild.
Legacy source, fixtures and characterization code are unchanged. Public source
and artifact scans found none of the supplied private export identifiers or
personal destinations/list labels. Relative documentation links and workflow
YAML/action pins were checked too.

The exact hosted workflow results must be inspected for the published phase
commit. Passing builds and storage doubles do not establish real extension
runtime or upgrade results.

## Remaining runtime/release limits

- Browser storage has no general multi-key transactions or compare-and-swap.
  This protocol serializes participating new writers and detects verified
  publication/retry outcomes; it cannot make legacy document storage, sync and
  disk persistence one atomic transaction. Old tabs, profile inspectors and
  browser sync do not obey the new lock. Close old pages and test genuine upgrades
  and browser shutdown/suspension before release.
- Raw backup, stage and history copies consume quota. No data is deleted to make
  room, no `unlimitedStorage` permission is silently added, and no automatic
  pruning policy is enabled. Quota failure blocks activation and offers a
  read-only recovery download where the source is JSON-representable. Real
  browser quota accounting and large installed profiles still need measurement.
- Corrupt/missing canonical metadata is not automatically reset. Unexplained
  orphan state and future schema versions remain blocked. The JSON export keeps
  evidence; generalized repair/import and archive restoration remain later work.
- Rollback here concerns migration before normal CRUD exists. Later mutation
  history, concurrent editors and release rollback semantics must extend this
  protocol without invalidating its retained records.
- Chromium remains administrator-blocked from loading extensions in this cloud
  environment; Firefox is absent. No real browser UI, signed same-identity upgrade,
  account sync, crash-durability or accessibility pass is claimed.

Phase 3 must build its list/settings/opening/menu services behind the verified
readiness gate and the same serialized writer protocol. It must not reinterpret
a pending stage as permission to initialize or mutate user data.
