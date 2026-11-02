# Phase 6: Remove legacy components

Recorded 2 November 2026, starting from
[`daaf7b0ccbf0381a33ff566f7d565a98c2f1b10a`](https://github.com/EuanRiggans/BulkURLOpener/tree/daaf7b0ccbf0381a33ff566f7d565a98c2f1b10a)
on `redevelopment`. This phase cleans and packages the browser implementation;
it does not publish a store release or establish genuine signed upgrades.

## Removed implementation and retained data support

65 tracked legacy files are retired:

- `app/`: the replaced HTML/global-script extension, duplicate manifest/icons,
  old themes and vendored jQuery, Bootstrap and Font Awesome assets (52 files).
- `main.js`, `utilities/`, `build/`, `unstable-build-script.sh`, `test/spec.js`:
  Electron lifecycle/CLI/window helpers, desktop icons, packaging and launch test.
- `test/characterization/` and its dedicated baseline workflow: the executable
  old implementation's 49 observations, including known defects.

The historical implementation and tests remain at the starting checkpoint and
the [Phase 0 inventory](PHASE_0_BASELINE.md) still anchors source/line references
to its original commit. The [Phase 4 feature matrix](PHASE_4_FLOWS.md) and
[Phase 5 browser evidence](PHASE_5_HARDENING.md) explain their replacement coverage.
Retiring tests for removed code is not a claim that those defects should return.

All ten historical JSON fixtures remain unchanged. Maintained migration,
legacy export/import, mirror reconciliation, ambiguity review, verified raw
backups, settings/ID remapping, drafts, recovery and job services remain active.
No extension storage is deleted or rewritten by source cleanup. The four
`public/icon/` PNGs are byte-identical to their original copies.

Application files under `src/` are unchanged from Phase 5. The simple popup,
separate editors, all preferences, private isolation and exact saved-list menu
contract remain. The Firefox ID and permission/CSP policy are unchanged.
Comparison against the Phase 5 build artifact from
[run 41517386564](https://github.com/EuanRiggans/BulkURLOpener/actions/runs/41517386564)
found all 98 existing generated resources byte-identical. Only `LICENSES.txt`
is added to each browser output.

## Maintained tooling and dependencies

- Removed obsolete lint/format/ignore exceptions, the legacy npm test command,
  desktop issue-template prompts and the obsolete baseline workflow. Modern
  service/UI/migration tests stay in Vitest; Node's runner tests packaging.
- Vitest: `5.0.5` → `5.1.0`; Selenium: `4.49.0` → `4.51.0`. Their Node/Vite
  requirements fit the Node 24 baseline. Added pinned `fflate@0.8.3` only for
  development-time ZIP generation/inspection.
- Retained current compatible WXT/Vite, TypeScript 6, ESLint 10, Preact, Valibot,
  happy-dom and axe versions. TypeScript 7 exceeds typescript-eslint's declared
  `<6.1.0` peer range; Node 26 type declarations do not match the Node 24 baseline.
  Upgrading a version number alone is not a compatibility improvement.
- Updated the stale-issue action from unpinned v3 to pinned v11, with scoped
  issue/PR write permissions and the existing 30-day/5-day policy. No workflow
  is dispatched and no community message is sent by this phase. Scheduled
  behavior still follows the default branch until a separate merge.
- Dependabot checks npm and GitHub Actions weekly, grouping minor/patch tooling
  updates. Runtime/framework updates still require source/licence validation.

The recorded audit after updates reports zero declared-runtime advisories and
18 full-toolchain entries: 17 moderate, one low, zero high/critical. The remaining
advisories are minimatch glob amplification (`GHSA-g3hv-75wg-m249`, including
parent propagation) and deepmerge prototype poisoning (`GHSA-gcqx-w48m-w2h4`).
They are in lint/Mozilla tooling, not the bundled runtime helpers.

Current upstream tools still depend on affected ranges. npm's suggested fixes
include downgrading ESLint to 4 or web-ext to 2; those are incompatible with this
toolchain. No unsupported blanket major override or advisory suppression is
introduced. The existing high/critical CI gate remains; lower-severity upstream
remediation and release advisory review remain explicit work.

## Packages, licences and reproduction

[The build guide](BUILD_AND_PACKAGE.md) describes the commands and archive contract.

- `scripts/verify-source.mjs` rejects the retired paths/dependencies and checks
  historical fixture presence. Future accidental reintroduction fails validation.
- `scripts/package-lib.mjs:64` selects Git-tracked source, or the exported
  source manifest. Untracked data is excluded. Private/generated/retired paths,
  environment files, symlinks and incomplete source lists are refused.
- `scripts/package-lib.mjs:153` builds sorted ZIPs with fixed timestamps and
  permissions. ZIP inspection rejects duplicate/escaping members. Full-content
  comparisons and `SHA256SUMS` verify the three package files.
- `scripts/check-reproducibility.mjs` rebuilds from extracted source without a
  `.git` directory (Git is still used by the checkout-selection unit test),
  validates it, and compares both browser outputs, three ZIPs and checksums.
  Synthetic environment/export/profile decoys must not enter the rebuilt source.
- `scripts/licenses.mjs` and `scripts/verify-builds.mjs` verify notices against
  installed package versions and source-map attribution. `public/LICENSES.txt`
  includes the project's MIT licence and notices for Preact, Valibot, Superlock
  and WXT/browser/storage helpers. Their six bundled package names are accounted
  for, even when helpers come through development dependencies. The WXT MIT copy
  is retained under `licenses/` because its npm packages omit that file.

The extension-check workflow validates and reproduces the packages before
uploading `dist/` as `extension-preview-packages` for 14 days. Old download links
are not the permanent backup; the pushed source and lockfile recreate them.
Generated packages/caches/profiles stay untracked.

## Validation scope

- 267 maintained Vitest checks plus seven packaging checks: 274 total. The 49
  retired characterizations are not counted as tests of the cleaned extension.
- Strict types, lint, formatting, source guard, both MV3 builds and packaged
  resource/licence checks pass. Each browser has nine pages and 50 resources.
- Mozilla validation has zero errors/unreviewed warnings and the same one
  reviewed, source-mapped Preact renderer warning. No broad ignore was added.
- Archive member/byte checks pass. Clean source reproduction passes for all
  100 generated browser resources, three ZIPs and checksums, with synthetic
  private environment/export/profile decoys excluded from the source package.
  The source ZIP contains 151 maintained files plus its generated file manifest.
- The hosted Chrome/Firefox/Firefox ESR matrix remains a final checkpoint check;
  its run is inspected on the pushed phase commit alongside CodeQL and extension
  validation. The browser cases and their existing scope limits are unchanged
  from Phase 5.

The reproduction test covers Linux and the installed Node 24 toolchain; it does
not prove every OS/toolchain produces identical bytes. The browser suite uses
synthetic fresh profiles; it does not establish signed installed-user upgrades,
remote account-sync delivery, manual screen-reader listening or remaining native
platform behavior. Those remain the [manual release gates](PHASE_5_MANUAL_CHECKS.md)
and Phase 7 work. No store upload, default-branch merge or signing-key handling
occurs here.
