# Browser-extension redevelopment plan

Recorded 1 November 2026. Source baseline:
[`4eb346d3bca8a12e6fa0f7e5ba891fcb711d9bf7`](https://github.com/EuanRiggans/BulkURLOpener/tree/4eb346d3bca8a12e6fa0f7e5ba891fcb711d9bf7).
The earlier chat's redevelopment commits and branch are considered lost by the
user's explicit instruction. This is a fresh redevelopment effort.

## Product decisions

The product is a browser extension for opening URLs/searches in batches and
managing saved lists. All Electron desktop runtime, CLI and release packaging
will be removed. Existing extension data and useful workflows must survive.

The user delegates routine technology and presentation choices. These explicit
requirements constrain that discretion:

1. Keep the popup simple. The supplied screenshot is a reference for the quick
   textarea-and-buttons workflow, not a requirement to reproduce every pixel.
2. Create and edit lists on their own extension page(s), never inside the popup.
3. Keep context menus basic: right click, **Bulk URL Opener**, **Open Lists**,
   then one clickable entry per saved list. The plural **Open Lists** is exact.
4. Push completed phases to the GitHub `redevelopment` branch and verify them.

The popup will focus on a labelled URL textarea, a prominent Open action,
current-tab capture, clearing, and a saved-list selector with compact actions.
Settings and help remain accessible. Tools, transfer/sync, snapshots, migration
and diagnostics belong in full extension pages. A temporary auto-open override
remains available when that preference is enabled. Accessibility is compatible
with this small scope; it does not require a dashboard in the popup.

Context-menu entries will open lists through the same opening service as the
popup and startup handling. Rebuild them when lists change and after lifecycle
events, and register click listeners at background evaluation time. Empty state
will be a disabled `No saved lists` entry. Fresh installations will enable the
basic menu; existing enabled/disabled values will be preserved during migration
and remain adjustable in options. No extra menu groups are planned.

Manual browser-account sync is retained, alongside local storage, JSON transfer
and recovery snapshots. Chromium browser services and Firefox do not provide a
shared cross-vendor sync account. Exports remain the transfer route between them.

The repository is public. User-supplied exports, personal destinations/list names,
profiles, chat transcripts and unsanitized diagnostic data must stay out of
commits. Inspect private examples in memory; public fixtures must be constructed
independently with synthetic content. The Firefox add-on ID is public manifest
metadata and may be recorded for identity preservation.

## Technical direction

Use WXT/Vite, strict TypeScript, Preact, runtime schema validation (Zod or an
equivalent), modern CSS/design tokens, Vitest, and browser-specific integration
testing. Prefer WXT's typed browser abstraction; add another compatibility layer
only if the selected implementation needs it. Use npm and a committed lockfile.
Node.js 24 is the development/CI baseline.

Phase 1 implements this foundation with WXT/Vite, Preact and supported compatible
TypeScript/ESLint versions. See [its implementation record](PHASE_1_TOOLING.md).
Runtime schema validation is added with the actual storage/migration models in
Phase 2. The Phase 1 preview does not initialize or modify user data.

Keep entrypoints thin. Separate pure URL/list/settings models from browser APIs,
storage, scheduling and UI. Use a validated, versioned canonical store in
`storage.local`, separate job/recovery records where appropriate, and one
serialized mutation service with explicit revision handling. Browser storage
does not supply general transactions or compare-and-swap.

Preserve fractional-second opening delays in active execution; alarms alone
cannot provide them. Persist jobs and due times, define runner ownership, and
use alarms for recovery. Treat interrupted tab creation as ambiguous because
tab creation and storage acknowledgement cannot be atomic. Do not promise
exactly-once opening after a browser crash.

Publish browser-specific manifests: a Chromium service worker and Firefox event
background scripts as supported by the selected browser targets. Keep script
content bundled, use safe DOM rendering, and request only implemented features'
permissions. Preserve original store identities and review current store privacy
requirements before release. The source licence is MIT; align inconsistent
package metadata during tooling modernization while retaining asset licences.

## Browser support policy

- Primary desktop targets: current stable and previous stable major versions of
  Chrome and Edge; current stable Firefox and the currently supported Firefox
  ESR release(s). Record exact versions in the release test evidence.
- Exercise Windows, macOS and Linux where those browsers are available. Cloud
  testing on one OS is not evidence for all desktop platforms.
- Preserve portable Chromium behaviour relevant to existing Opera, Brave and
  Vivaldi users. Treat those distributions as secondary compatibility checks;
  don't silently delete an existing store identity or listing.
- Mobile browsers, standalone web-app hosting and Electron are outside this
  redevelopment's support target. No mobile compatibility is claimed.
- Final minimum-version manifest values follow verified capabilities in Phase 1;
  an engine's theoretical API floor does not establish a tested support promise.

## Phase order and gates

| Phase | Work | Exit evidence |
| --- | --- | --- |
| 0: Establish the baseline | Record requirements, complete feature/settings/storage inventory, preserve synthetic historical fixtures and characterize legacy behaviour. | Baseline checks pass; legacy runtime unchanged; phase commit exists on GitHub. |
| 1: Establish browser-only tooling | Modern builds, TS, UI foundation, manifests, lint/tests and CI alongside the legacy reference; active desktop tooling retired. | Chromium/Firefox output, generated-resource validation and identity strategy documented in [Phase 1](PHASE_1_TOOLING.md). |
| 2: Protect and migrate data | Read document storage and mirrors; back up raw sources, validate/reconcile, stage and verify canonical state; expose recovery. | Corruption, conflicts, repeated execution, quota and interruption cases preserve raw data and verified records. |
| 3: Extract shared services | URL policy, list/settings services, browser adapter, recoverable opening jobs and basic context menu. | Consistent settings across popup/startup/menu paths; failure/restart handling tested. |
| 4: Rebuild functional flows | Popup, separate list editors, options, all opening modes, capture, tools, transfer/sync, help and recovery. | Feature inventory checked row by row; all legacy preferences mapped or an intentional change documented. |
| 5: Accessibility and browser hardening | Keyboard/screen readers, zoom, large lists, restricted destinations, private windows, worker suspension and cross-device sync. | Real browser evidence and explicit remaining limitations. |
| 6: Remove legacy components | Remove Electron and replaced application/vendor code, retire executable legacy tests, retain historical data fixtures/migration, update dependencies/docs/packages. | Checks pass on the cleaned candidate; source/archive reproduction and contents inspection complete. |
| 7: Verify upgrades and release | Same-identity signed upgrades, final data comparisons, store disclosures and controlled release preparation. | User-approved release with verified preservation and retained recovery support. |

Phase 0 records recommendations; it does not implement the new application or
fix the characterized legacy defects. Authorization to work on Phase 0 does not
automatically start every later phase.

## Checkpoint workflow

For each authorized phase, run the checks appropriate to the changed code,
inspect the diff, commit the completed work, push to `origin/redevelopment`, and
independently verify the remote branch head matches the local commit. Include a
GitHub commit link in the completion report. Preserve the phase's documents and
tests in that same checkpoint. Do not rely on an unpushed workspace or temporary
download links as the sole backup.

Use normal fast-forward publication. If the branch advanced remotely, inspect
and reconcile it before continuing; never overwrite others' work to establish a
checkpoint. A blocked push is a reported blocker, not a completed backup.

## Release conditions still outstanding

The user directly confirmed the Firefox add-on ID on 1 November 2026:
`{c5b32a48-5514-4a46-81f2-075ebf3cbc29}`. Preserve it in the Firefox manifest.
Its direct confirmation supersedes reliance on the lost chat. Genuine signed
upgrade testing under that same identity is still required.
Chrome/Edge/Opera listing identities from the README likewise need confirmation.
Do not uninstall an existing add-on to prepare an upgrade test: that can remove
its data. Use backed-up copies of profiles and genuine same-identity updates.

Real signed upgrade results, remote sync delivery, browser/OS runtime coverage,
accessibility checks, current dependency advisories and store declarations are
release gates. None is established by passing the Phase 0 VM tests.

See [the baseline](PHASE_0_BASELINE.md) for the source inventory, exact legacy
defaults, defect references, migration constraints and validation scope.
