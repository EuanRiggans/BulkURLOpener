# Redevelopment working agreement

Read [the redevelopment plan](docs/REDEVELOPMENT_PLAN.md) and
[the Phase 0 baseline](docs/PHASE_0_BASELINE.md) before changing the application.
Current tooling and its validation limits are documented in
[Phase 1](docs/PHASE_1_TOOLING.md).
Storage invariants and recovery limits are recorded in
[Phase 2](docs/PHASE_2_DATA.md).
Shared services and opening invariants are recorded in
[Phase 3](docs/PHASE_3_SERVICES.md).
Functional flows, transfer/draft contracts and the parity checklist are recorded
in [Phase 4](docs/PHASE_4_FLOWS.md).
Private-session isolation and real-browser/accessibility evidence are recorded
in [Phase 5](docs/PHASE_5_HARDENING.md), with remaining manual release checks in
[the test protocol](docs/PHASE_5_MANUAL_CHECKS.md).
Browser-only cleanup and source/package reproduction are recorded in
[Phase 6](docs/PHASE_6_CLEANUP.md) and [the build guide](docs/BUILD_AND_PACKAGE.md).
Release preparation and outstanding blockers are recorded in
[Phase 7](docs/PHASE_7_RELEASE.md), with [upgrade verification](docs/UPGRADE_VERIFICATION.md)
and [store disclosure drafts](docs/STORE_SUBMISSION.md). The user-approved
[storage simplification](docs/STORAGE_SIMPLIFICATION.md) supersedes the earlier
unbounded-history, sync and snapshot contracts. Development same-ID
tests are not signed-store evidence. Keep preview status until the release gates
are actually satisfied and a specific release is authorized.

- Work on `redevelopment`. Its fresh starting commit is
  `4eb346d3bca8a12e6fa0f7e5ba891fcb711d9bf7`.
- Treat the earlier chat's redevelopment branch, commits and reported test
  results as lost. They are not an implementation to recover or assume present.
- At the end of every authorized phase, run the relevant checks, review the
  diff, commit, push to `origin/redevelopment`, and verify the actual GitHub head
  equals the local commit. Report the commit and any validation limitations.
  A local commit or a successful local build alone is not the phase checkpoint.
- Keep a phase's status honest if pushing or verification is blocked. Preserve
  completed work and explain the blocker instead of claiming it is backed up.
- Preserve browser-extension functionality and user data throughout the rewrite.
  Electron desktop windows, CLI and packaging are intentionally being retired.
- The popup must stay simple: URL entry/opening, capture/clear and saved-list
  selection/actions. Put settings, tools, recovery and diagnostics elsewhere.
- Creating and editing lists must use their own extension page(s), outside the
  popup. Sharing an editor component is fine; inline popup editors are not.
- The basic context menu is exactly:
  `Bulk URL Opener > Open Lists > [saved lists]`.
  Use stable internal list IDs; do not add tools/settings/selection menus to it.
- Retired legacy characterizations remain in Git at the Phase 5 checkpoint.
  Their `legacy defect:` cases are not requirements to retain those bugs.
  Maintain the modern tests for corrected behaviour and historical data formats.
- Keep raw migration sources and verified recovery data. Do not silently choose
  between conflicting storage copies or erase malformed records.
- This repository is public. Never commit user-provided exports, browser
  profiles, personal URLs/list names, chat transcripts or unsanitized debug data.
  Inspect private samples in memory and use independently constructed synthetic
  fixtures with reserved .test destinations and generic names. Review staged
  changes for private content before each push. The published add-on ID is public
  extension metadata; preserve it for update compatibility.
- Review commit metadata too. Use the repository's GitHub noreply email for
  commits created here instead of a personal contact address.
- Browser runtime tests and genuine signed-upgrade
  tests are separate from mocked tests and build validation.
- Proceed within the phase authorized in the current conversation. Publishing,
  merging to the default branch and store releases are separate actions.

Historical phase records describe their own checkpoints, including commands and
paths retired in Phase 6. The current source has no Electron or replaced `app/`
implementation. Keep the historical migration fixtures and converters; removing
obsolete code must never delete existing browser data or legacy-format support.
Use `npm ci` and `npm run validate` on Node.js 24; `npm run dev` /
`npm run dev:firefox` run the preview. Packaging includes only intended tracked
source, or the exported source manifest. Keep notices for every bundled runtime
helper current, and verify source/archive reproduction before phase publication.
New runtime writes belong to the background storage coordinator and its shared
Web Lock. Keep legacy document/local/sync sources read-only. Preserve immutable
original backups/stages, verify full content and expected revisions, and publish
the active head last. Never initialize defaults over unreadable/future state or
erase recovery data to fix quota. A readiness check outside a mutation is not a
transaction. List/settings/opening/menu services must use the migration gate.
Normal mutations use schema-4 independent checkpoints and content-addressed
lists/settings/metadata; schemas 1/2/3 remain readable for migration/recovery.
Retain at most five preceding checkpoints under the 4 MiB incremental history
target, always keeping the preceding verified save. Verify the candidate before
publishing and retain a durable deletion manifest before removing obsolete new
records. Earlier preview history requires a matching downloaded recovery archive
and explicit user confirmation before eligible removal. Never delete original
migration sources, damaged records, unresolved input or jobs during maintenance. Keep assigned list IDs through edits, deduplicate request IDs and reject
stale revisions. Job plans/results are immutable; publish progress heads last.
Establish alarms before publishing a job; its signal and idle cleanup are ordered
under the writer lock. Keep tab effects and sleeping outside that lock, and use
the separate runner lock for tab effects. Never
automatically replay unconfirmed tab creation or reuse window/tab IDs across
browser sessions without explicit retargeting. Helper URLs carry opaque refs.
Opaque startup/runtime metadata uses storage.session with its named locks;
user-data writes still belong to the coordinator. Private requests must use the
separate ephemeral adapter and epoch-bound coordinator: Firefox storage.session,
Chromium split-mode incognito IndexedDB. Chromium shares storage.session across
split contexts; do not put private contents there. Its private background must
never execute regular startup/jobs, nor may the regular background open the
private database. Never route private drafts,
list edits, recovery records, imports or jobs to local/sync storage. Ended-session
callbacks must fail, and final-window cleanup must share the private writer lock
with publication and alarm signalling. Global menus and startup stay regular.
Mozilla validation has one narrowly source-mapped, version-pinned Preact vendor
warning exception; new application warnings must not be silently added to it.

Working drafts use one verified mutable record separate from full library
history; conflict copies and editor handoffs are immutable. Do not debounce
popup text into a save that only runs after its document closes. Keep stale
editor/settings input visible and reuse an uncertain request's original ID.
Replacement imports use a retained, immutable preview and its expected head,
never a fresh sync fetch at acceptance. Only the Data page can accept transfer.
Browser-account sync uploads and snapshot capture/purge are retired. Keep old
sync stores read-only and retain local recovery of their existing copies. Never
clear account storage or request optional technical/settings-data consent.
Archives use bounded native gzip JSON, checksums and the shared verifier; imports
allow 64 MiB decoded / 16 MiB compressed with a smaller message transport limit.
Protect unresolved reviews. Consumed schema-2 transfer bodies can be collected
only after their owning new-format checkpoint leaves retention. Keep existing
preview archives until verified external archival; checksums are not encryption.
