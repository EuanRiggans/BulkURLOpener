# Phase 3: Extract shared services

Recorded 1 November 2026. Starting checkpoint:
`ec9fc0bf9abcc47dea0d26611f7cd4a115021b04` on `redevelopment`.

## Implemented scope

The browser background now owns typed list/settings/draft mutations, one URL
policy, tab capture, durable opening jobs, browser-startup handling, saved-list
context menus and load-on-focus resolution. Every path uses verified migrated
data. Legacy application/desktop source and historical fixtures remain unchanged.

The popup and separate new/edit pages remain preview shells for Phase 4. Their
full interaction rebuild is not part of this phase. A separate opening/progress
page supplies the recovery controls needed by the new jobs. Settings now has a
basic context-menu checkbox and a way to review/resume interrupted data changes.
No general import/sync/snapshot-management UI or release package is introduced.

## Source map and contracts

References point to the maintained source in this phase:

| Source                                                                     | Responsibility                                                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/domain/library.ts:11`                                                 | Pure create/update/delete, settings patches and draft updates.                          |
| `src/domain/storage/schema.ts:172`                                         | Runtime command schemas; version-1 migration and version-2 mutation records.            |
| `src/application/storage/coordinator.ts:314`                               | Serialized, revision-checked mutations and durable idempotency.                         |
| `src/application/storage/coordinator.ts:375`                               | Inspection of verified pending mutations.                                               |
| `src/application/storage/coordinator.ts:416`                               | Job journal access behind the same readiness/writer lock.                               |
| `src/domain/opening/urls.ts:49`, `:107`, `:125`                            | Destination validation, first-URL extraction and complete batch planning.               |
| `src/domain/opening/schema.ts:40`, `:65`, `:110`                           | Immutable plans, small run snapshots and final entry receipts.                          |
| `src/application/storage/job-journal.ts:39`                                | Verified job persistence; immutable records and head publication.                       |
| `src/application/opening/service.ts`                                       | Shared enqueue, settings snapshots and explicit recovery decisions.                     |
| `src/application/opening/runner.ts:25`                                     | Runner ownership, due times, tab effects, acknowledgements and restart recovery.        |
| `src/application/opening/startup.ts:25`                                    | Browser-session startup latch, including no-op and window-less startup.                 |
| `src/application/menus.ts:17`                                              | One basic saved-list hierarchy, lifecycle refresh and partial-build cleanup.            |
| `src/application/service-protocol.ts:78`, `src/application/services.ts:34` | Page-specific authorization and validated service dispatch.                             |
| `src/infrastructure/browser/opening.ts:18`                                 | Session identity, consent, window validation, alarms, native timers and menu callbacks. |
| `src/entrypoints/background.ts`                                            | Synchronous event registration and asynchronous recovery bootstrap.                     |
| `src/entrypoints/opening/`, `deferred/`                                    | Separate progress/recovery and held-tab pages.                                          |
| `src/ui/services/`                                                         | Settings controls, pending-change review and fixed public error explanations.           |

The migration protocol remains available on the options page. Both protocols
use a shared validated client envelope. List editors can invoke their own CRUD
operation; they cannot invoke an opening command. Content-script identity alone
does not grant access: protocol, extension host, exact page path and operation
must all match. Private senders are refused before new persistent user-data
writes. Callback replies return literal `true` for older Chromium compatibility.

## Lists, settings and history

- List names must contain non-whitespace text on new saves; a rejected edit does
  not delete the original. Single-line and deliberately empty URL arrays work.
  Actual strings, blank lines, Unicode and duplicate names/lines are preserved.
- New list IDs are `list-` plus a cryptographically generated 256-bit request ID.
  Creation is retryable with that same ID. Existing IDs remain unchanged when
  editing names/URLs. New lists have `legacyId: null`; migrated numeric IDs,
  including zero, remain available as provenance.
- Deleting a list unsets both initial-popup and browser-startup references when
  they point to that ID. Unrelated settings and drafts remain unchanged.
- All 17 settings remain typed. A partial settings update preserves other fields
  and cannot introduce references to nonexistent lists. Draft writes retain
  trailing blank lines and exact entries.
- Every mutation carries an expected canonical head and an operation ID. A stale
  edit is rejected. Reusing an ID with different content is rejected. Retrying an
  identical operation after later edits returns current verified state without
  applying the old operation again or undoing subsequent work.

The canonical head remains schema version 1. Old migration/rollback records keep
their schema-1 representation; new mutation records use schema 2 and retain the
previous head, original backup/stage references, full data and exact command.
The verifier checks hashes, revisions, references and the command's effect on
the preceding state. Neither legacy storage nor recovery history is overwritten.

A mutation writes and verifies its immutable candidate before publishing its
head. A failed acknowledgement is safe to retry. A verified uncommitted mutation
can be reviewed and resumed in Settings using its original command. An unrelated
new mutation cannot overwrite an unexplained pending candidate.

Migration undo is intentionally closed once ordinary mutations or opening jobs
exist (`coordinator.ts:196`, `:561`). This prevents an early migration rollback
from discarding later work. A pending rollback can still be retried. Broader
history restoration requires Phase 4's explicit recovery workflows; all original
sources and immutable records remain available to the existing JSON export.

Mandatory mutation/job history is distinct from the optional user-facing
automatic snapshots controlled by `disableSnapshots`. This phase does not
implement automatic pruning, snapshot purge or replacement import.

## Shared opening policy

All triggers build the same plan from fresh canonical data, then retain one
settings snapshot for that job. Changes to preferences do not rewrite a running
job's destinations, order or timing. Saved-list edits/deletion likewise do not
silently change an already requested opening plan.

| Input/setting                                                            | Behaviour                                                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Surrounding whitespace and blank input                                   | Trim for execution; report empty entries; preserve original inputs in the plan/report.                                           |
| HTTP/HTTPS URLs                                                          | Validate with URL parsing; preserve explicit HTTP and encoded query/fragment values.                                             |
| Bare domains, `www`, localhost, IPv4 and bracketed IPv6                  | Use HTTPS as the modern default. Explicit HTTP remains supported.                                                                |
| FTP, file and browser-internal URLs                                      | Preserve the explicit scheme; browser-dependent rejection is recorded rather than rewriting to HTTP.                             |
| JavaScript, data, blob, extension and other unsafe/unsupported protocols | Reject with a reason; never execute or disguise them with an HTTP prefix.                                                        |
| Search policy                                                            | Preserve Google/DuckDuckGo/Bing choice, use HTTPS and encode the entire query value safely. Common search operators remain text. |
| Ignore policy                                                            | Omit non-URL text and report it; no legacy prefix fallback overrides the choice.                                                 |
| Extract policy                                                           | Use the first valid supported URL; localhost fallback works and unbalanced prose parentheses are handled.                        |
| Duplicate removal                                                        | Compare normalized destination URLs, keep the first occurrence, then apply reverse order. Report omitted duplicates.             |
| Empty/all-rejected batches                                               | Return a completed empty plan/report with no tab creation or activation.                                                         |

Only execution is normalized: stored list/draft text and raw recovery sources
are not rewritten by this policy. Unsafe destinations remain recoverable as
text. Navigation restrictions, local-file access and removed FTP support depend
on the browser; API refusal pauses the job for explicit review.

Tabs are created inactive. After successful creation/receipt recording, final
activation applies to the last recorded successful tab when enabled. Load-on-
focus keeps placeholders inactive and takes precedence over activation, matching
the legacy interaction. A failure in final activation never reopens destinations.

## Job protocol and recovery

| Local key                               | Contents                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `buo:v2:job-plan:<job ID>`              | One immutable, checksummed plan: origin head, settings, target session/window, destinations and rejected inputs. |
| `buo:v2:job-state:<record digest>`      | Immutable small progress snapshot: cursor, status, timing, in-flight operation, error and activation state.      |
| `buo:v2:job-result:<job ID>:<position>` | Immutable checksummed final entry receipt: opened, explicitly assumed opened, or explicitly skipped.             |
| `buo:v2:job:<job ID>`                   | Current progress pointer/revision, published last.                                                               |

Progress snapshots do not repeat URL arrays. Each successful creation records a
receipt before advancing the cursor. The final completion path checks the full
receipt view. Plans, receipts and prior snapshots remain available if a later
write fails. An identical enqueue ID cannot create a second copy of a job.

The global storage writer lock is held for bounded planning/persistence and the
alarm signal that accompanies queue publication or idle cleanup. This makes an
idle alarm clear and a new enqueue mutually ordered. Sleeping and browser tab
calls run outside it, so pause/cancel can be recorded while
a browser operation is pending. A separate origin-wide runner Web Lock prevents
two background instances from creating the same pending tab concurrently.

| Interruption/failure                                    | Recovery                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Plan/initial state written before the first job head    | Resume only the verified initial intent. A missing head with progressed history is blocked rather than reset to zero.              |
| In-flight create with no final receipt                  | Mark unconfirmed and require review; do not automatically create that destination again.                                           |
| Receipt saved before cursor/head acknowledgement        | Advance from the verified receipt without creating another tab.                                                                    |
| Browser creation failure/timeout                        | Retain the entry and pause for an explicit retry, assume-opened or skip decision.                                                  |
| Pause/cancel during a browser call                      | The already-started operation can finish; record its result and stop further creation.                                             |
| In-flight activation after a restart                    | Require activation review; never reopen the completed URL batch.                                                                   |
| A new browser session                                   | Pause pending work and require an explicit target window. Clear old tab IDs used for activation rather than trusting recycled IDs. |
| Corrupt/future job metadata or unexplained missing head | Fail closed, retain evidence and offer the full Settings recovery export; do not guess a cursor.                                   |

Exactly-once tab creation cannot be guaranteed: browser tab creation and storage
acknowledgement are separate effects. Native tab calls have a timeout; a late
success can still happen after a timeout. Retrying an unconfirmed entry therefore
warns about possible duplicates. Normal automatic recovery never blindly replays
an unconfirmed create. A user-selected, exact owned placeholder can prove that
a held tab exists and allow its receipt to be recorded without duplicating it.

Recovery alarms are established **before** publishing a job and re-established
when running. Chrome's 120 floor permits a 30-second periodic backstop. Active
execution uses short timers, preserves fractional-second spacing and retains
absolute due times. Work is sliced into at most 25 steps/10 seconds; long waits
leave a native wake and alarm. Suspension/restart can make an opening late, but
an early alarm cannot bypass the stored due time. Browser scheduling is not a
real-time timing guarantee. Idle/paused/review-only queues clear their owned wake
alarms. An empty migrated profile does not acquire a permanent 30-second polling
loop. A concurrent enqueue re-establishes its signal under the writer lock;
coalesced kicks request another active slice rather than losing a wake during
idle cleanup.

## Startup, context menus and held tabs

Startup uses a verified `storage.session` latch and a separate runtime-session
identity, both containing only metadata. A worker wake does not create a new
startup request. Duplicate/recovered startup events reuse the same job ID. A
disabled startup preference is marked handled without producing permanent empty
jobs, and enabling it later in that session does not retroactively open a list.
Startup before the first normal window remains pending until one is available.
Installation/update does not masquerade as browser startup.

The menu is exactly `Bulk URL Opener → Open Lists → [saved lists]`. Empty state
is a disabled `No saved lists`. It uses stable internal IDs, reads current data
on click, rebuilds after lifecycle/data changes, and clears partial builds on
failure. An existing disabled preference remains disabled; Settings has an
explicit checkbox. No tools/settings/selection groups are added. Menu failures
do not prevent independent job recovery.

Held tabs use `/deferred.html?job=<opaque ID>&index=<position>`. Private destination
URLs are not embedded in helper-page queries or decoded twice. The background
checks the sender, actual tab URL, plan/receipt, active tab and focused normal
window before navigation. A per-tab lock prevents duplicate navigation requests;
a tab that navigated away is refused. Capture restores a readable held target
instead of saving the helper URL and omits the extension's own UI pages.

The separate progress page exposes pause, resume in this window, cancellation,
entry resolution and activation recovery. Remaining destinations and omissions
are shown as text. The simple popup gains no dashboard or inline list editor.

## Permissions and privacy review

The exact API permissions are `storage`, `tabs`, `alarms` and `contextMenus`.
There are no broad host permissions, content scripts, offscreen documents,
download permission or Electron APIs. `tabs` supports full capture and trusted
helper checks. `alarms` supports job recovery. Native menu creation/removal uses
callbacks and checks `runtime.lastError`; these APIs cannot all be assumed to
return Promises on the minimum Chromium version.

Opening destinations and sending non-URL searches now transmit URLs/query text
to the sites/providers chosen by the user. Firefox therefore declares required
`browsingActivity` and `searchTerms`, replacing Phase 2's `none`. Firefox grants
are checked before opening/recovery effects. There is no developer telemetry,
analytics, remote font, app-managed sync upload or separate collection server.

The following current official sources were reviewed on 1 November 2026:

- [Firefox data consent taxonomy and declaration](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Mozilla add-on policies, data transmission/private browsing](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Permissions object and data-collection grants](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/Permissions)
- [Menu creation callback semantics](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus/create)

These were inspected through their official Mozilla/MDN GitHub source. Future
store submission still requires review of the completed feature set and listing.

**Private-window execution/capture remains unavailable in this preview.** A
private sender/target is refused before creating a persisted job, capture omits
private tabs, and the runner checks target mode again. Migration from a private
document is refused too. This avoids writing private-browsing data into the new
local job/history format. Session-only private execution and its lifetime/access
rules must be implemented and tested in Phase 5 before claiming that capability.
The service never silently redirects a private request into a normal window.

## Validation and remaining limits

The suite currently has 205 modern tests plus all 49 preserved legacy checks.
It covers URL policies, safe search encoding, list identity/reference handling,
idempotent/stale/concurrent mutations, settings snapshots across triggers,
startup latches, exact menus, message authorization, consent/private guards,
held-tab navigation and fault injection around each acknowledgement boundary.
A 50-entry job verifies small per-step records instead of repeated URL plans.

Both browser builds and generated checks cover six pages, the exact permission
set, signing identity, CSP and local assets. Mozilla validation still has only
the same narrowly source-mapped, version-pinned Preact renderer warning; no new
warning exception was added. The runtime audit reports zero advisories. The
development graph retains 17 moderate/one low affected entries, zero high or
critical, unchanged from Phase 2. No dependency versions changed in this phase.

A clean `npm ci` and full validation passed in a separate directory with no
existing dependencies or generated types. All 72 generated resources (36 per
browser, including source maps) were byte-identical after that rebuild. Public
source/artifact privacy checks, workflow YAML/action pins and documentation links
passed. Legacy source, fixtures, characterization code, popup and editor shells
are unchanged. Only the existing migration-message unit expectation was extended
for the new rollback-readiness field, alongside a private-document guard test.

Commit/push, independent GitHub head verification and inspection of the exact
hosted workflow results remain required at the phase checkpoint.

Real Chromium extension loading remains blocked by administrator policy here;
Firefox is not installed. No real browser UI, signed-upgrade, account-sync,
cross-OS, private-mode or accessibility pass is claimed. Browser API doubles do
not establish those results.

Further work is explicit:

- Phase 4 rebuilds the functional popup/editor/settings/tool/transfer/sync flows
  using these services and maps every original feature/preference to visible UI.
- Job corruption currently stops automatic queue processing; retained JSON
  evidence enables deliberate repair. Generalized repair/import and selective
  recovery UI remain later work. A damaged job never triggers a fresh zero cursor.
- Recovery/history has no automatic pruning. Quota exhaustion blocks writes
  without deleting data. Long canonical histories and full-store reads need real
  browser measurement/optimization in Phase 5, preserving verification rules.
- Worker suspension, shutdown, actual browser window restoration, local files,
  restricted URLs, Firefox grants and private-mode session lifetime need genuine
  browser tests. Alarm wake latency and final activation races need measurement.
- Store identity, disclosure and signed upgrades remain separate release gates.

All synthetic fixtures and tests stay public-safe. Raw personal exports, browser
profiles, private URLs/list labels and diagnostic contents are not committed.
