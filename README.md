# Bulk URL Opener

A browser extension for opening URLs and searches in batches and managing saved lists.

**The `redevelopment` branch is a development preview.** Phase 7 adds upgrade-preservation checks and release preparation. Genuine signed upgrades, long-term storage capacity and the remaining release gates still require verification. Use an isolated development browser profile.

The popup stays focused on URL entry and simple actions. Creating and editing lists use separate pages. The context menu is `Bulk URL Opener → Open Lists → [saved lists]`; enable it in Settings for an existing profile. Fresh installations enable the basic menu. Settings, Data & recovery, Tools, Help and Opening jobs have full pages.

## Development

Use Node.js 24 (see `.nvmrc`) and npm.

```sh
npm ci
npm run validate
```

```sh
npm run dev           # Chromium development build
npm run dev:firefox   # Firefox development build; requires Firefox
```

Use WXT's isolated development profile or a separate disposable profile. Never uninstall your normal add-on to test an upgrade. The Firefox build deliberately retains the existing add-on ID, so loading it in your normal profile could replace that installation.

## Builds and checks

| Command                                             | Purpose                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run build`                                     | Production-mode Chromium MV3 preview in `.output/chrome-mv3/`.                              |
| `npm run build:firefox`                             | Production-mode Firefox MV3 preview in `.output/firefox-mv3/`.                              |
| `npm run build:all`                                 | Build both browsers.                                                                        |
| `npm run check`                                     | Strict TypeScript, ESLint, formatting, modern service/UI tests and packaging tests.         |
| `npm run check:build`                               | Check generated manifests, resources, CSP, icons and build contents. Run after both builds. |
| `npm run lint:firefox`                              | Mozilla validation of the generated Firefox extension.                                      |
| `npm run validate`                                  | All of the above checks and both builds.                                                    |
| `npm run test:packaging`                            | Archive safety, source selection and deterministic packaging checks.                        |
| `npm run test:browser`                              | Real-browser suite; requires configured disposable Selenium browsers as in browser CI.      |
| `npm run test:upgrade`                              | Same-ID development update with synthetic historical stores; not signed-store verification. |
| `npm run upgrade:compare -- BEFORE.json AFTER.json` | Read-only comparison of private baseline/recovery files; fixed codes and counts only.       |
| `npm run package`                                   | Build verified Chrome/Firefox/source ZIPs and SHA-256 checksums in `dist/`.                 |
| `npm run check:packages`                            | Verify every archive member, its bytes and checksums against the current source/build.      |
| `npm run check:reproducibility`                     | Install/build/test the source ZIP in a fresh directory and compare output bytes.            |

WXT generates browser-specific background configuration: a Chromium service worker and Firefox background scripts. Source version `2.0.0` comes from `package.json`; this is an unreleased redevelopment version, not a store submission.

The Phase 1 capability floors are Chromium 120 and Firefox 142. The release test policy targets current/previous Chrome and Edge stable, current Firefox stable and supported ESR. Capability floors do not establish completed browser testing.

## Project layout

```text
src/entrypoints/              Background and nine bundled extension pages
src/infrastructure/browser/  Browser API adapters
src/application/storage/     Serialized migration/recovery coordinator and protocol
src/application/opening/     Shared planning, execution and startup services
src/application/workspace.ts Drafts, reviewed transfers and old-archive recovery
src/domain/storage/          Typed schemas and pure legacy reconciliation
src/domain/opening/          URL policy and typed job model
src/shared/                  Pure internal navigation helpers
src/ui/                      Preact pages/components, form flows and local CSS
public/icon/                 Existing extension icons
test/unit/                   Modern Vitest checks
test/browser/                Real extension/runtime and axe accessibility checks
test/packaging/              Archive safety and reproducibility contracts
test/fixtures/legacy/        Synthetic historical storage examples
scripts/                     Source/build/package/licence verification and packaging
licenses/                    Reviewed upstream licence missing from published WXT packages
docs/                        Baseline, decisions, phases and validation evidence
```

The retired `app/`, Electron runtime/CLI/icons, vendored UI assets and executable legacy tests have been removed. Their final reference is [the Phase 5 checkpoint](https://github.com/EuanRiggans/BulkURLOpener/tree/daaf7b0ccbf0381a33ff566f7d565a98c2f1b10a). Historical data fixtures and the active migration/recovery implementation remain. The old desktop build commands do not apply to this browser-only project.

## Preview packages

After validation, use `npm run package` and `npm run check:packages`. They produce Chrome, Firefox and source ZIPs plus `dist/SHA256SUMS`. These are unsigned development previews. They are not uploaded to an extension store.

Source packages include Git-tracked maintained files, tests, fixtures, documentation, licences and the lockfile. Stage or commit intended new files before packaging; untracked files are excluded. Exported source packages contain an explicit file manifest so they can rebuild without a `.git` directory. Full validation also requires Git for the checkout-selection packaging test. `npm run check:reproducibility` verifies a clean install from that archive, both browser builds and all package bytes, including exclusion of synthetic private files.

See [build and package instructions](docs/BUILD_AND_PACKAGE.md) for archive contents, licence updates and reproduction. Keep `dist/` dedicated to the current version's generated packages; verification rejects unexpected files there.

## Data and privacy

In Settings or Data & recovery, **Data protection and recovery** captures exact legacy sources, shows conflicts and migrates reviewed data. Nothing migrates on startup. Original legacy stores stay unchanged; new records are verified before activation. Migration undo is closed after normal edits or jobs exist so later work cannot be discarded.

The popup saves working text promptly to a separate verified record; conflicts and new-list handoffs are retained as immutable copies. Initial loading never auto-opens a list. Auto-load and auto-open remain separate preferences, with a temporary popup override. List saves and settings autosave use revision checks; stale edits stay visible for review. Select **Save settings** to save immediately.

Data & recovery supports portable 2.x and legacy 1.x JSON exports, paste/file import, reviewed replacement and inspection of retained legacy archives. Recovery imports restore lists/settings while keeping current drafts/jobs; other imported records remain in the retained original while its recovery checkpoint is kept. Original migration backups and unresolved imports are protected.

Browser-account sync and automatic/manual snapshots have been removed. Existing sync copies and old snapshot archives remain available for read-only inspection and local recovery. Nothing is uploaded or cleared in account storage; JSON export/import transfers lists between installations. Firefox retains required browsing/search consent for opening and no longer requests optional settings-data consent.

Lists, settings and draft metadata use separate checksummed records. Unchanged lists are reused across saves. Independent checkpoints keep the current save and one preceding verified save. Cleanup failures keep extra records and retry later. Protected originals, unresolved work and the active library still need storage space; there is no unlimited-capacity claim.

Earlier preview history is not silently deleted. Download a **full recovery archive**, select that downloaded file under **Archive earlier preview history**, and explicitly confirm. Only a matching, verified archive authorizes deletion of eligible, unneeded preview records. Migration backups, damaged records, unresolved inputs and jobs remain protected. Archives are compressed JSON with checksums, not encryption: keep them private. Imports support up to 64 MiB decoded JSON / 16 MiB compressed; keep a separate lists/settings export too. See [the current storage contract](docs/STORAGE_SIMPLIFICATION.md).

Saved-list startup preferences use the same opening policy. Jobs retain a settings snapshot and durable acknowledgements; interrupted/unconfirmed tab creation needs review instead of blind replay. Pending work from a new browser session needs an explicit target window. Settings links to staged-change and opening-job recovery.

Jobs retain URLs/search input locally and navigate to user-chosen destinations/providers. Firefox declares and checks corresponding consent before opening destinations.

Private access requires the browser's extension grant. A private workspace starts with regular saved lists/preferences; its drafts, edits, recovery checkpoints and jobs use temporary private storage (Firefox session storage; Chromium's isolated incognito IndexedDB). Closing the last private window clears that workspace; browser restart/extension reload can clear it too. Capture stays within the matching privacy scope. Recovery of old sync copies and startup remain regular, and the global menu always lists regular saved lists. Explicit file/clipboard exports can outlast a private session. See the [privacy policy](privacy-policy.md) and [Phase 5 hardening record](docs/PHASE_5_HARDENING.md).

Download a recovery file first, then choose **Inspect and back up data**. Conflicting preferences and ambiguous historical comma records require explicit choices. Storage errors block activation rather than deleting data to make room. Recovery downloads contain private data; keep them private. See [the Phase 2 contract and limits](docs/PHASE_2_DATA.md).

Signed upgrades and the remaining native browser/platform checks remain release gates. See [Phase 7](docs/PHASE_7_RELEASE.md) and the [upgrade comparison protocol](docs/UPGRADE_VERIFICATION.md).

This is a public repository. Never commit personal exports, browser profiles, private URLs/list names or unsanitized diagnostics. All committed migration fixtures are synthetic. The Firefox add-on ID is public extension metadata.

## Redevelopment records

- [Phase 0 baseline and feature inventory](docs/PHASE_0_BASELINE.md)
- [Redevelopment decisions and roadmap](docs/REDEVELOPMENT_PLAN.md)
- [Phase 1 tooling and validation](docs/PHASE_1_TOOLING.md)
- [Phase 2 data protection and migration](docs/PHASE_2_DATA.md)
- [Phase 3 shared services and job recovery](docs/PHASE_3_SERVICES.md)
- [Phase 4 functional flows and feature parity](docs/PHASE_4_FLOWS.md)
- [Phase 5 accessibility, private sessions and browser evidence](docs/PHASE_5_HARDENING.md)
- [Remaining manual release checks](docs/PHASE_5_MANUAL_CHECKS.md)
- [Phase 6 cleanup and package evidence](docs/PHASE_6_CLEANUP.md)
- [Phase 7 release preparation and remaining gates](docs/PHASE_7_RELEASE.md)
- [Storage simplification, retention and archive safety](docs/STORAGE_SIMPLIFICATION.md)
- [Upgrade preservation and comparison protocol](docs/UPGRADE_VERIFICATION.md)
- [Store identity and disclosure draft](docs/STORE_SUBMISSION.md)
- [Historical storage fixtures](test/fixtures/legacy/README.md)

Completed phases are committed, pushed to `redevelopment` and verified against GitHub. Linux automation exercises Chrome stable, Firefox stable and Firefox ESR with synthetic data. It does not establish screen-reader listening, other operating systems or genuine signed upgrades; those remain separate release gates.

## Existing store listings

These links are retained from the legacy project. They do not distribute this development preview.

- [Chrome](https://chrome.google.com/webstore/detail/bulk-url-opener/kgnfciolbjojfdbbelbdbhhocjmhenep)
- [Firefox](https://addons.mozilla.org/firefox/addon/bulkurlopener/)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/bulk-url-opener/cfopcknfhpogkpcnnppcaedkhokachoo)
- [Opera](https://addons.opera.com/en-gb/extensions/details/bulk-url-opener-2/)

MIT licensed; see [LICENSE](LICENSE).
