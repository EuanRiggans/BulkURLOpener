# Storage simplification after Phase 7

The user authorized removal of browser sync and automatic snapshots, separation
of lists/settings, independent bounded checkpoints, preservation of recovery
sources and verified archival of earlier preview history. This record supersedes
the earlier phase contracts where they require unbounded history or active sync
and snapshot features. The popup stays simple with a 540px preferred width;
list creation/editing stay on separate pages and context menus keep their basic
saved-list hierarchy. This is still an unreleased preview.

## Current storage contract

- Schemas 1/2/3 remain readable. Normal saves use schema 4, retaining the existing
  head/revision interface. Each checkpoint has checksummed references to separate
  lists, settings and draft/recovered-input metadata. Unchanged list content is
  shared. Settings changes do not rewrite the URL arrays.
- Verification uses each checkpoint's own content and origin, not an endless
  replay chain. Following the user's final preference, keep the current save
  and one preceding verified save as the sole internal fallback. Shared content
  is counted once. Current data, the fallback, original backups and unresolved
  work still consume finite storage; a failed save never discards the fallback
  to make room. The first schema-4 preview's five-reference roots remain readable;
  the next save reduces ordinary retention to one without breaking either state.
- A frozen, verified older state can initially supply unchanged component values
  without copying large lists at near quota. Its own checksum/data and original
  backup/stage are checked. After archival frees room, data is materialized into
  independent content records. Retained earlier points can keep the frozen base
  until they leave retention; it is never removed while referenced.
- Persist the new intent before component writes, verify the complete candidate,
  then publish the head last. Partial saves retain their request identity and
  references. Complete pending candidates can resume; an incomplete component
  save needs the original editor/archive input. There is no automatic default
  reset or silent replay. Recent 64 request receipts prevent duplicate saves;
  an older original request has a stale revision and fails safely.
- Only verified obsolete new-format roots, their unneeded components and consumed
  pure portable lists/settings transfer bodies enter automatic cleanup. Full
  recovery and legacy import originals stay protected beyond checkpoint expiry:
  they may contain original backups, damaged input or unresolved drafts/jobs
  outside the active library. A checksummed deletion
  manifest is retained before removal, so partial deletion can resume. Damaged or
  unknown records and unresolved reviews/drafts are preserved. A cleanup failure
  after publication does not turn an acknowledged save into a reported failure;
  extra records remain for retry. Jobs are never deleted by this maintenance.

Implementation: [checkpoint schema](../src/domain/storage/checkpoints.ts),
[reader/planner](../src/application/storage/checkpoints.ts),
[coordinator](../src/application/storage/coordinator.ts) and
[maintenance](../src/application/storage/maintenance.ts).

## Old preview history and external archives

Download a full recovery archive on Data & recovery. Keep it privately, close
other editors/reviews and pause jobs. Select the downloaded file under **Archive
earlier preview history** and explicitly confirm. The background verifies the
archive's compression/checksums and exact document/local/sync sources before
recording durable authorization. A stale file, portable export or corrupt file
cannot authorize removal. Interrupted maintenance can retry using that same
verified archive and stored authorization.

Only verified acknowledged schema-2 ancestry, applied transfer provenance and
valid old optional snapshots are eligible. Unresolved import reviews, pending
save components, drafts, jobs, damaged records, original migration backups/stages,
raw legacy stores and account caches remain. Records still referenced by current,
retained or pending saves are kept. Proofs persist until removal finishes, then
become small receipts; up to twenty completion receipts are retained. Do not
expect all old records to disappear immediately if retained points still use them.

Automatic/manual snapshot capture and purge controls are removed. The legacy
`disableSnapshots` value remains in compatibility data/exports but has no active
effect. There are sixteen active preferences. Old snapshot/legacy archives can
still be inspected; internal recovery copies can be downloaded for explicit
review/import. None of these actions opens saved jobs or destinations.

Browser-account sync upload code and Firefox optional settings-data consent are
removed. The `storage` permission remains necessary for local records and
read-only recovery of old account caches. Existing legacy/preview account copies
can be reviewed and restored locally; no sync key is uploaded, overwritten or
cleared. JSON transfer is the supported transfer route.

## Recovery-file round trips

Full recovery downloads use native gzip plus base64 within versioned JSON. The
inner recovery envelope and source checksums remain compatible with the shared
verifier. No new dependency, encryption or developer service is introduced.
Legacy uncompressed full-recovery and verified-backup downloads remain accepted.

Limits are 64 MiB decoded JSON, 16 MiB compressed bytes and 24 MiB transport text.
The UI encodes ordinary files before messaging the background to stay below
Chrome's message-size ceiling. Streaming decompression stops at the decoded
limit; invalid UTF-8, malformed/truncated gzip/base64 and checksum mismatches fail
before replacement. Current lists/settings import only after explicit review;
current drafts/jobs remain and imported jobs never replay. Applied plain lists/settings import originals follow checkpoint retention.
Full recovery/legacy import originals remain protected locally; keep the external
file as an independent backup too.

A full archive can still exceed these limits, or an active library/protected
sources can fill storage. Save a portable lists/settings export separately.
Failure never truncates data, clears storage or adds `unlimitedStorage`. These
bounds address ordinary save-history growth, not unlimited retention of arbitrary
user data.

Implementation: [archive codec](../src/domain/storage/archive.ts),
[transfer service](../src/application/workspace.ts),
[maintenance UI](../src/ui/recovery/StorageMaintenancePanel.tsx) and
[upgrade comparison](UPGRADE_VERIFICATION.md). The frozen upgrade comparator
accepts packed files; intentional edits/archival are outside an unchanged-record
upgrade comparison.

## Verification

Local validation passes 294 unit checks and seven packaging checks, strict
types/lint/format, both MV3 builds, Mozilla validation and clean source/archive
reproduction. Both browser builds (100 resources total), all three ZIPs and
checksums reproduce byte-for-byte; private decoys are excluded. Mozilla reports
zero errors/unreviewed warnings and the existing reviewed Preact warning.

The maintained tests cover 1,000 settings saves with 5,000 exact entries, stable
storage after warmup, single-fallback retention, idempotency/stale retries, partial
component/head writes, partial deletion/retry, protected inputs/jobs/originals,
a near-10-MiB old preview store, verified archive cleanup and recovery files over
8 MiB. Archive tests include invalid compression/UTF-8/checksums and expansion
limits. Existing private-session isolation checks continue to apply.

The browser matrix now checks read-only account-cache recovery, native quota
failure/same-request retry, 100 large-library settings saves with plateaued
storage, and compressed recovery review, alongside existing native API, upgrade
and accessibility checks. Check the [browser workflow results](https://github.com/EuanRiggans/BulkURLOpener/actions/workflows/browser.yml)
for the exact pushed checkpoint and browser versions. The second development
upgrade test seeds old schema-2 history and verifies stale-archive rejection,
authorized cleanup, retained originals and compressed-archive review. A managed workspace policy blocks local extension
installation and is not bypassed. Signed published upgrades, native assistive
technology, actual popup/menu/download UX and other OS/browser coverage remain
separate release gates; see [the manual checks](PHASE_5_MANUAL_CHECKS.md).
