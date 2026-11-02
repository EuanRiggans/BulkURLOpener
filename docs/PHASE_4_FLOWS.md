# Phase 4: Rebuild functional flows

Starting checkpoint: `bff46696afc469a82c6ce96c6b00d363d6cc8e01` on
`redevelopment`. This is a development preview, not a store release. Legacy
application/desktop code and historical fixtures remain a frozen reference.

## Implemented scope and source map

The popup supports entry/opening, capture/clear, saved-list controls and the
temporary automatic-opening override. Initial contents never trigger automatic
opening. Creation/editing remains on separate pages. Settings, data transfer,
recovery, tools, help and progress have full pages. All opening triggers still
use the Phase 3 policy and recoverable runner.

| Source                                               | Responsibility                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/ui/pages/Popup.tsx:23`                          | Initial contents, prompt draft saves, independent selection preferences and opaque editor handoffs. |
| `src/ui/ListEditor.tsx:17`                           | Separate create/edit form, validation, stable IDs and retained stale input.                         |
| `src/ui/services/SettingsForm.tsx:66`                | All 17 preferences, fractional delays, 700 ms autosave and explicit Save.                           |
| `src/ui/pages/DataPage.tsx:35`                       | JSON, manual sync, snapshots, legacy archives and recovered input.                                  |
| `src/ui/services/TransferReview.tsx`                 | Replacement acknowledgement, full review and stable retry ID.                                       |
| `src/ui/pages/Tools.tsx:16`, `Help.tsx:10`           | Extraction/reversal, FAQ, version/store/history links and reviewed diagnostics.                     |
| `src/entrypoints/opening/main.tsx`                   | Pause/resume/recovery and remaining-destination text/copy/download.                                 |
| `src/domain/portable.ts:22`                          | Strict portable v2 schema, reference checks and legacy compatibility export.                        |
| `src/domain/workspace-schema.ts`                     | Validated draft, snapshot and transfer message/record models.                                       |
| `src/application/workspace.ts:121`                   | Reviewed transfer/sync, exports, drafts, snapshots and redacted diagnostics.                        |
| `src/application/storage/workspace-store.ts:36`      | Draft integrity, handoffs/conflicts, immutable previews and bounded optional snapshots.             |
| `src/application/storage/coordinator.ts:346`         | Mutations with pre-change snapshots and one shared writer/transaction boundary.                     |
| `src/application/service-protocol.ts`, `services.ts` | Exact-page authorization, migration gates and consent.                                              |
| `src/ui/mount.tsx`, `styles.css`                     | Persisted appearance presets, local fonts, focus indicators and native controls.                    |

The new popup/data/help/tools entrypoints mount page components. No new runtime
framework or remote resource was introduced. `happy-dom@21.0.4` is a pinned,
development-only dependency for rendered form/service tests, not packaged code.

## Baseline feature acceptance

This records implemented behavior and automated evidence. It does **not** assert
real browser, account-sync, accessibility or genuine upgrade success.

| Baseline                 | Phase 4 disposition and evidence                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01: entry/open          | Labelled textarea/Open, durable job feedback and results link. Popup DOM and opening-job checks.                                                               |
| F02: text policies       | Search/ignore/extract selectors feed the shared planner. Settings, URL-policy and shared-trigger checks.                                                       |
| F03: search providers    | Google/DuckDuckGo/Bing retained; common HTTPS/query encoding. Same sources/tests as F02.                                                                       |
| F04: capture             | Current/all normal windows, private/unavailable/own-page omissions and held-destination recovery. Service and popup checks.                                    |
| F05: clear               | Clears/saves the working draft and focuses the textarea. Popup DOM check.                                                                                      |
| F06: list CRUD           | Separate pages, nonblank names, single-line/empty-entry saves, stable IDs, confirmed deletion/reference cleanup. Library/editor checks.                        |
| F07: auto-load           | Independent preference; selection loads when enabled or needed for deliberate auto-opening. Popup selection DOM check.                                         |
| F08: auto-open/override  | Only deliberate selection opens; override appears whenever enabled, including with auto-load off. Initial loading/Edit/Delete never open. DOM checks.          |
| F09: initial contents    | Current capture, previous working draft or saved list; numeric zero remaps safely. Popup, migration and transfer checks.                                       |
| F10: drafts              | Exact lines/Unicode/encoding, clear persistence, verified current record and retained conflict/handoff copies. Workspace and DOM checks.                       |
| F11: fractional delay    | Numeric options support fractions; active runner timing/restart behavior retained. Settings and opening-job checks.                                            |
| F12: progress            | Dedicated pause/resume/cancel, ambiguous-operation review and remaining text/copy/download. Progress UI and runner checks.                                     |
| F13: load-on-focus       | Preference restored; opaque holding pages and selected/focused navigation retained. Existing held-tab checks.                                                  |
| F14: startup             | List selector including None; real startup-event execution/session latch retained. Settings and startup checks.                                                |
| F15: reverse/deduplicate | Both feed the common planner. Deduplicate normalized destinations before reversing; preserve saved text. URL/shared-trigger checks.                            |
| F16: final activation    | Preference restored; runner retains separate activation acknowledgement for every trigger. Existing opening checks.                                            |
| F17: window/shortcut     | More contains separate-window action with target context; MV3 action command retained. Adapter and generated-manifest checks; real execution remains Phase 5.  |
| F18: appearance          | Default/Fluent local CSS, explicit night mode and four button styles without Bootstrap/jQuery. Visual/contrast/browser checks remain Phase 5.                  |
| F19: settings saves      | Valid choices autosave after 700 ms; explicit immediate Save. Acknowledged success, errors keep choices. DOM/service checks.                                   |
| F20: JSON                | Portable v2/legacy v1 export, copyable text/file download, paste/file import, reviewed replacement and retained originals. Transfer/DOM checks.                |
| F21: manual sync         | Reviewed upload, frozen download, previous-cache backup, visible-change detection, item cap/error feedback and local read-back. Sync fault/concurrency checks. |
| F22: snapshots           | Five optional pre-change copies, manual capture/review/restore, disable/purge and legacy-archive inspection. Snapshot fault/retention checks.                  |
| F23: tools               | Multiple URLs per line; reversal preserves blanks unless explicitly omitted. Tools DOM checks.                                                                 |
| F24: help/version        | FAQ, installed version, source/issues/history and retained store links. Browser/store manages updates; no legacy external version endpoint.                    |
| F25: diagnostics         | Reviewed counts/preferences report; content and actual list references excluded. Redaction check.                                                              |
| F26: menus               | Exact basic hierarchy; checkbox in full preferences. Canonical/lifecycle refresh retained. Existing menu checks.                                               |

All 17 legacy settings map to canonical fields; none was discarded.
`defaultBoostrap` remains recognized on import and used for compatibility export.
Theme presets preserve the choice through local tokens, not obsolete vendor
stylesheets. Multiple extraction matches and optional blank-line removal are
deliberate corrections to the legacy standalone tools.

## Data contracts

### Drafts and stale edits

Each popup input event dispatches a save without a close-time debounce. One
mutable `buo:v2:draft` holds a record and verified digest, separate from full
library history. Typing does not copy every list or append full text snapshots.
Client ID, increasing sequence and expected draft digest reject stale competing
writes. Older same-client requests cannot overwrite newer text; reusing a
sequence with different text is rejected.

Conflicting versions and explicit editor/tool/recovered-input handoffs are
immutable `buo:v2:draft-state:<digest>` records. URLs carry opaque references,
not names/destinations. Editors load the exact handoff even after later typing.
Legacy canonical draft lines are the fallback. Recovered pending openings never
execute automatically. A popup without `sender.tab` resolves its window before
exposing editable data or accepting draft writes.

List/settings writes retain expected revisions and operation IDs. Errors keep
unsaved input. The editor can explicitly retain its text while refreshing the
saved revision for comparison. Settings reload requires acknowledgement when
dirty. Uncertain retries retain their original ID until input changes. Closing
an editor without saving can still discard unsaved editor changes; popup draft
persistence is a separate feature.

### Imports, exports and recovery

Portable v2 exports contain stable lists and all settings. Legacy v1 exports
preserve available unique numeric IDs, including zero, allocate other IDs without
collisions and remap both list preferences. Ordinary exports exclude drafts,
jobs, provenance and history; full recovery downloads include retained records.

Imports accept strict v2, historical v1 and checksum-verified recovery files.
File decoding rejects invalid UTF-8. Inputs over 8 MiB are rejected without
truncation; storage quota may impose a lower practical limit. Historical damage
and unknown fields require review and remain raw. Recovery files with canonical
data use their verified latest state; otherwise legacy sources are reconciled.

Each immutable `buo:v2:transfer:<digest>` freezes the original input, source and
base head. Acceptance rereads that payload, validates choices and commits one
`library.replace` against the reviewed head. It never refetches sync at acceptance.
Only lists/settings are replaced: current drafts/jobs remain; other imported
records stay in the retained raw import and imported jobs are never replayed.
Later canonical verification checks the transfer digest. Publication retries use
the same operation ID; staged changes are reviewable in Settings.

### Manual browser-account sync

The modern copy uses one `bulk-url-opener-v2` key with a payload digest. The
original `user_settings` key remains read-only. Users can inspect that legacy copy
even when a modern copy exists. Only explicitly reviewed lists/settings upload,
after Firefox consent; no automatic uploads occur after local changes.

Upload review freezes the exact payload and visible sync cache locally. The
local head and visible cache must still match at acceptance. Previous contents
are retained/read back at `buo:v2:sync-backup:<digest>` before replacement. The
new single-key API write is read back and compared. An identical retry after a
lost acknowledgement does not write twice.

The 8,000-byte item/key cap leaves margin under Chromium's 8,192-byte quota;
larger libraries use files. No chunk protocol or automatic sync deletion is
introduced. Total quota, account availability and remote delivery are browser-
controlled. A local lock cannot provide cross-device compare-and-swap: unseen
remote concurrent edits can still race uploads. Real delivery/concurrency is a
Phase 5 gate. Firefox/Chrome account services do not sync between each other.

### Optional snapshots

Before non-draft library changes, a verified optional snapshot captures the old
lists/settings unless automatic snapshots were already disabled. Only after the
new copy verifies are older valid optional copies pruned to five. Cleanup failure
retains extra copies; damaged records are counted and retained. Manual capture
works even when automatic capture is disabled.

Purge removes only verified optional `buo:v2:snapshot:` keys. Original legacy
snapshots, migration/transfer sources, canonical/job history and damaged records
remain. Snapshot/archive restoration uses the same reviewed replacement path.
Mandatory history and retained transfers/handoffs remain unbounded in this
preview. Quota/performance and an agreed retention/export policy remain release
work, not a reason to erase recovery data automatically.

## Validation and remaining gates

- **247 modern + 49 frozen legacy = 296 passed**: 32 new workspace checks and
  10 rendered DOM flows cover transfer, sync faults, draft concurrency, snapshots,
  simple popup selection, one-line/stale edits, autosave and acknowledged import.
- Strict TypeScript, typed ESLint and formatting checks pass. Both production-
  mode MV3 builds contain nine pages. Resource verification checks manifests,
  CSP, fixed Firefox ID, four permissions, local resources and Electron exclusion.
- Mozilla validation: zero errors/unreviewed warnings. The one pinned,
  source-mapped Preact renderer warning exception remains unchanged.
- Runtime audit: zero reported advisories. Full toolchain: 17 moderate, one low,
  zero high/critical, unchanged from Phase 3. No blanket audit fix was applied.
- Legacy application/desktop and historical fixture/characterization source stay
  byte-identical to Phase 3. Public changes use synthetic data/public metadata.

DOM tests use happy-dom/mocked browser adapters with real application/storage
services. They do not establish browser engine/API behavior. This workspace has
an extension-blocking Chromium policy and no Firefox; neither limit was bypassed.
Real Chrome/Firefox/ESR execution, worker suspension, private-session handling,
file/internal URLs, clipboard/download/window/shortcut behavior, accessibility,
large-library quota and cross-device sync remain Phase 5 gates. Signed upgrades
remain Phase 7. This is not ready to replace an installed personal profile.

The phase checkpoint is pushed normally to `redevelopment`, then checked against
the independent GitHub head and hosted checks. Default-branch merging, extension-
store publication and releases are outside this phase.
