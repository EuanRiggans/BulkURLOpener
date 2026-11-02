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
- Legacy characterization tests document observed behaviour, including defects.
  Tests labelled `legacy defect:` are not requirements to retain those bugs.
  Replacement modules need tests for the corrected behaviour.
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
- Browser runtime tests, real cross-device sync and genuine signed-upgrade
  tests are separate from mocked tests and build validation.
- Proceed within the phase authorized in the current conversation. Publishing,
  merging to the default branch and store releases are separate actions.

Phase 0 changes documentation, fixtures, tests and their execution setup only.
The legacy `app/`, desktop source and dependency versions remain unchanged in
that phase. Use Node.js 24 and `npm run test:baseline` for its tests.

The Phase 1 toolchain is browser-only. Use `npm ci` and `npm run validate` on
Node.js 24; `npm run dev` / `npm run dev:firefox` run the preview. The legacy
application remains a frozen reference until replacement coverage is complete.
New runtime writes belong to the background storage coordinator and its shared
Web Lock. Keep legacy document/local/sync sources read-only. Preserve immutable
backups/stages/history, verify full content and expected revisions, and publish
the active head last. Never initialize defaults over unreadable/future state or
erase recovery data to fix quota. A readiness check outside a mutation is not a
transaction. List/settings/opening/menu services must use the migration gate.
Normal mutation records use schema 2 while retaining readable schema-1 migration
history. Keep assigned list IDs through edits, deduplicate request IDs and reject
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
list edits, snapshots, imports or jobs to local/sync storage. Ended-session
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
Manual sync writes only the new `bulk-url-opener-v2` key after explicit review,
consent, local backup and a visible-change check. Its original legacy keys stay
read-only; never clear the sync area. Optional snapshot cleanup can remove only
verified `buo:v2:snapshot:` records after a new copy is verified. Mandatory
history, original legacy snapshots and damaged records remain intact.
