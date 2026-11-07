# Interrupted saves, completed jobs and follow-up review

Prepared on 7 November 2026 after the storage-simplification checkpoint
`1a5dc8d210056a45e52abf89602f4bf6b3196478`. The user authorized fixing the two
confirmed issues and reviewing the remaining code. This remains an unsigned
preview on `redevelopment`; no store submission or default-branch merge occurs.

## Interrupted editing

A component write can fail after its checkpoint intent is saved. The old library
stays intact, but a closed editor cannot resume a change whose input is missing.
The previous implementation then blocked every new library mutation/import.

Data & recovery now offers **Set aside this interrupted save**. First download a
full recovery archive, select it for read-back and explicitly confirm. The
background verifies its checksum, exact document/local/sync sources and expected
active head under the writer lock. A stale/corrupt/portable file cannot authorize
this action, and an active/retained save cannot be quarantined.

The original interrupted state and its surviving content stay in the profile.
An immutable, checksummed quarantine receipt pins their references and retires
the old request ID. Later saves ignore that inactive intent without replaying it
or deleting it. A lost acknowledgement is retryable even after another editor
has saved. Damaged inactive headers can also be set aside; unknown future formats
remain blocked. Private quarantine uses the existing ephemeral adapter and does
not enter regular storage. Full storage or failed writes can still prevent the
small receipt from being published; the old library and original input remain.

Implementation: [quarantine schema](../src/domain/storage/quarantine.ts),
[receipt/reference reader](../src/application/storage/quarantine.ts),
[coordinator](../src/application/storage/coordinator.ts),
[Data recovery UI](../src/ui/recovery/InterruptedSaveRecovery.tsx).

## Completed opening history

New plan envelopes use a checksummed version-2 wrapper around the existing job
plan. Plans, current progress and tab receipts keep the same public service shape.
Only the current and preceding verified progress snapshots are needed by the
reader, so older verified new-format progress is collected after publication.
Receipts and the current/previous progress remain available for interrupted work.

Up to ten finished results are kept under a 1 MiB serialized-size target. The
newest finished result is always kept, including when that one result exceeds
the target. Queued, paused, cancelled, uncertain and in-flight jobs are protected.
Completed load-on-focus jobs are also protected while live helper tabs or their
unsettled about:blank navigations remain. A failed/incomplete tab query keeps all
such jobs. Regular/private tab queries and storage remain separate.

Earlier preview jobs are not silently removed or compacted. After a matching
full archive is explicitly verified through preview-history maintenance, eligible
finished older jobs can retire. Their full records must match that selected
archive; pending/damaged records and live helpers stay protected.

Deletion uses durable checksummed manifests, so interrupted removal cannot
resurrect a staged plan. Before forgetting completed request identities, the
background rotates an opaque request scope. A retained request still deduplicates;
a cached expired request fails with `OPEN_REQUEST_EXPIRED` and never opens tabs
again. The popup preserves that scope on uncertain retries. Starting a new
request after expiry requires another explicit gesture. Startup stores its scope
before queueing, so a lost startup acknowledgement cannot reopen an expired job.

Implementation: [retention and scope schema](../src/domain/opening/history.ts),
[job maintenance](../src/application/storage/job-maintenance.ts),
[journal](../src/application/storage/job-journal.ts),
[live tab adapter](../src/infrastructure/browser/held-jobs.ts),
[startup](../src/application/opening/startup.ts).

## Additional fixes from review

- **Confirmed and fixed: cleanup context after corruption.** A deletion plan could
  skip a changed record but remove its surrounding records. Maintenance now stops
  that whole plan if a present record's checksum changed. Missing records from an
  already interrupted deletion remain resumable. Damaged ownership context stays
  protected. See [library maintenance](../src/application/storage/maintenance.ts)
  and [job maintenance](../src/application/storage/job-maintenance.ts).
- **Confirmed and fixed: damaged fallback references.** A failed fallback read
  retained content blobs but could omit an older source state needed by that
  fallback. Its known references are now pinned; an unreadable header conservatively
  protects possible source records. Protection is separate from acknowledgement,
  so an unrelated staged change cannot become silently acknowledged. See
  [checkpoint reachability](../src/application/storage/checkpoints.ts).
- **Confirmed and fixed: repeated whole-store reads.** Job views used to read all
  storage once per tab receipt. Views now verify one storage snapshot, and lists
  reuse their snapshot while checking jobs. This removes repeated full-store
  cloning/API calls as a batch grows. See [journal](../src/application/storage/job-journal.ts).
- **Hardening:** archive file inputs reject stale async results after a new
  selection or unmount. This keeps the verified file tied to the user's current
  selection; backend source matching remains mandatory. See
  [file input](../src/ui/recovery/ArchiveFileInput.tsx).

## Further findings requiring follow-up

**Confirmed recovery gap at this checkpoint, now addressed:** see
[explicit corruption recovery](CORRUPTION_RECOVERY.md) for the follow-up fix and
its verification limits. At this checkpoint, corruption of the active library
blocked in-place import/restore, even if its independent fallback was healthy.
A synthetic check corrupted the current list blob, successfully exported the
previous copy, then received `INTEGRITY_CHECK_FAILED` while previewing that
copy for import. Existing guards deliberately prevented initialization or ordinary
mutations over unreadable data. The missing feature was a separate, explicitly
reviewed recovery activation after a verified full backup, with monotonic
revisions and protection against late/stale callbacks. Do not work around this
by clearing the profile or automatically selecting a fallback.

Historical source references:
[copy export](https://github.com/EuanRiggans/BulkURLOpener/blob/2ffb0e8ae46b9170d99370484e9bb2c59a34458d/src/application/storage/coordinator.ts#L1150),
[normal workspace gate](https://github.com/EuanRiggans/BulkURLOpener/blob/2ffb0e8ae46b9170d99370484e9bb2c59a34458d/src/application/storage/coordinator.ts#L648),
[import preview](https://github.com/EuanRiggans/BulkURLOpener/blob/2ffb0e8ae46b9170d99370484e9bb2c59a34458d/src/application/workspace.ts#L163).

**Optional capacity improvement:** frozen editor handoffs and unresolved import
reviews remain intentionally retained. Resolved handoffs do not yet have a
consumption/archival lifecycle. These records and original migration/recovery
sources can still consume finite storage; the completed-job and library bounds
are not an unlimited-storage promise. Any future cleanup must identify resolved
work reliably and preserve unresolved/damaged input.

Sources: [draft retention](../src/application/storage/workspace-store.ts#L47),
[editor handoff use](../src/ui/ListEditor.tsx#L42).

**Dependency review:** the fresh 7 November registry response still reports
fourteen development-tool entries (ten moderate, four low), zero high/critical.
The advisory families remain minimatch lint glob processing and Mozilla tooling's
deepmerge path. No compatible supported direct upgrade resolves them; npm proposes
major downgrades of ESLint/typescript-eslint/web-ext/WXT. No force downgrade,
unsupported major override or advisory suppression is applied. Available Preact
11.2.0/Vite 8.3.6 updates do not fix those paths and remain separate maintenance.
The fresh runtime-only audit reports zero advisories. CI security checks must
still be checked on the pushed commit.

## Validation and release limits

Local validation passes 318 unit tests and seven packaging tests, type/lint/format
checks, both MV3 builds and Mozilla validation (zero errors or unreviewed warnings;
one existing reviewed Preact vendor warning). Regression coverage includes
restarted partial saves, read-back authorization,
failed quarantine publication, damaged inactive headers, 100 finished batches,
count/size retention, partial job deletion, expired request/startup retries,
protected pending/held jobs and unsettled tabs, legacy job archival, changed GC
records, damaged fallback ownership and storage read counts. Native browser
coverage exercises the archive UI after real Chrome quota failure and job expiry
in Chrome/Firefox/ESR. Check workflows on the pushed commit for actual outcomes.

Signed upgrades from published installations, native action-popup/menu/shortcut
and clipboard/download UX, screen-reader listening and the wider OS/browser
matrix remain [release gates](PHASE_5_MANUAL_CHECKS.md). The managed local browser
policy is respected; hosted native tests are separate from local unit/build
results. No store credentials or authenticated store identity are configured in
this environment. Privacy/listing drafts are updated locally; their actual
website/dashboard publication requires separate release authorization.
