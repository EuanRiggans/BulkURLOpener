# Explicit recovery of an unreadable library

Prepared 7 November 2026, following recovery hardening commit
`2ffb0e8ae46b9170d99370484e9bb2c59a34458d`. This closes the confirmed in-place
restore gap recorded in [the preceding review](RECOVERY_HARDENING.md).

## User flow

The Data page offers **Restore an unreadable library** when an existing active
library fails integrity verification, or its pointer is missing while canonical
records remain. This never runs automatically. Healthy libraries continue to use
ordinary import/replacement; fresh installations use reviewed migration.

1. Close other editors and pause opening jobs. Download a full recovery file
   using the existing recovery controls. Keep that file privately.
2. Select that file for read-back, then explicitly choose a verified internal copy
   or an external export/recovery file. No copy is chosen automatically.
3. Inspect the proposed lists and every setting. Legacy formats retain their
   existing conflict/historical-list decisions. Confirm the replacement.

The full archive must match exact current document/local/sync sources. Portable
lists-only exports cannot authorize recovery of the damaged profile. A changed
profile requires a fresh archive/review. The selected replacement is frozen in a
checksummed review; acceptance does not fetch a newer file or account copy.

The restored library contains the reviewed lists/settings. Verified current
legacy draft/recovered-input metadata is retained where readable; separately
saved working drafts, existing jobs and unresolved inputs are not overwritten.
Unreadable metadata remains in the protected originals/full archive. Internal
copies preserve list IDs, legacy numeric identities and source provenance too.
Imported jobs are never installed or replayed, and the recovery operation makes
no browser-tab calls. Existing queued work retains its existing lifecycle, so
pause jobs before recovery if they must not resume when data becomes readable.

## Storage and publication

Recovery adds an explicit **schema-5 recovery anchor**, not a reset to revision
one or a mutation whose ancestry includes damaged data. The anchor references a
verified origin backup marker, stage and immutable `recovery-review` record. Its
revision exceeds every safe library/head revision observed during review,
including staged changes. Unknown future formats and exhausted revision counters
fail closed. Normal subsequent saves still use schema-4 independent checkpoints
with one preceding verified save as their ordinary fallback.

The review retains the exact old pointer (including absence/malformed JSON),
source/archive checksums, selected input, safe metadata and original library
record keys. The selected source is kept locally; original damaged and inactive
library records remain protected during later checkpoint/archive maintenance.
Protection does not acknowledge those old operations or make them resumable.
Damaged old quarantine receipts remain preserved rather than controlling the
new library. Nothing clears document storage, account caches or old backups.

Under the same background writer lock, acceptance rechecks the original pointer
and complete source fingerprint. It records the recovery intent first, verifies
the origin bodies and reconstructed candidate, rotates the opening-request scope,
then publishes and reads back the active pointer last. Failed/corrupt writes do
not authorize overwriting damaged bodies. Same-request retries can finish
partial writes; a lost publication acknowledgement is idempotent even after a
later ordinary edit. Different recovery attempts and stale editor/import/opening
requests cannot replace a newer winner.

Recovery requires enough free space for its review, verified replacement and
small publication records. It never deletes protected data to make room. Existing
64 MiB decoded / 16 MiB compressed archive and transport limits still apply.
An installation with insufficient room may need its privately retained exports
restored in a separate clean profile. Do not clear the original profile first.

## Private sessions and authorization

Only the Data page in the matching regular/private workspace can call the new
endpoints. Private recovery remains in Firefox session storage or Chromium's
isolated incognito database. A background restart can expose the existing
epoch-bound coordinator for explicit recovery while normal services remain
integrity-gated. Missing private pointers never trigger a fresh copy from regular
storage. Session identity is checked independently, and final-window cleanup
removes the whole temporary namespace. Late callbacks from ended sessions fail.

Implementation:
[schema](../src/domain/storage/recovery.ts#L39),
[recovery transaction](../src/application/storage/recovery.ts#L56),
[anchor/protection reader](../src/application/storage/recovery-records.ts#L39),
[checkpoint reader](../src/application/storage/checkpoints.ts#L87),
[coordinator](../src/application/storage/coordinator.ts#L477),
[protocol authorization](../src/application/storage/messages.ts#L20),
[Data UI](../src/ui/recovery/CorruptedLibraryRecovery.tsx#L18),
[shared import inspection](../src/application/transfer-inspection.ts#L14).

## Verification and remaining limits

Local type/lint/format checks, both MV3 builds and Mozilla validation pass
(zero errors or unreviewed warnings; one existing reviewed Preact vendor warning).
The complete validation suite and a separate final preservation regression
exercise fallback/file/legacy recovery, malformed/missing
pointers, write failures before/after/drop/corruption at each publication step,
restarts, stale requests/competing recoveries, exact raw preservation, further
editing/maintenance, archive re-import and private epoch isolation/cleanup. A UI
test performs file read-back and two-stage confirmation. Native Chrome/Firefox/
ESR coverage restores corrupted data through the actual picker and review without
creating tabs. Check the workflows on the pushed commit for final results.

This does not repair arbitrary damaged drafts/jobs or guess missing list data.
Their records remain available for inspection/export. Unknown future formats,
unreadable storage APIs, fully exhausted storage and unavailable healthy exports
can still prevent restoration. Resolved editor-handoff cleanup remains optional
follow-up work. The known development-tool advisories and signed/native/manual
[release gates](PHASE_5_MANUAL_CHECKS.md) remain separate from this recovery fix.
