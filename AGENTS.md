# Redevelopment working agreement

Read [the redevelopment plan](docs/REDEVELOPMENT_PLAN.md) and
[the Phase 0 baseline](docs/PHASE_0_BASELINE.md) before changing the application.
Current tooling and its validation limits are documented in
[Phase 1](docs/PHASE_1_TOOLING.md).
Storage invariants and recovery limits are recorded in
[Phase 2](docs/PHASE_2_DATA.md).

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
Mozilla validation has one narrowly source-mapped, version-pinned Preact vendor
warning exception; new application warnings must not be silently added to it.
