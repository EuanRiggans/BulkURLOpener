# Bulk URL Opener Privacy Policy

This policy describes the unreleased `redevelopment` preview, including the
storage simplification and recovery hardening after Phase 7. It does not claim the preview has replaced
a published store version.

The extension stores saved lists, preferences, drafts and recovery records
locally. It has no developer collection server, analytics, telemetry or remote
fonts. Browser-API information is used only for the extension functions below,
not sold or used for advertising, profiling, creditworthiness or lending. Its
use follows the Chrome Web Store User Data Policy, including Limited Use.

Opening a batch navigates to user-chosen destinations. With the search policy,
non-URL text is sent over HTTPS to the chosen Google, DuckDuckGo or Bing search
provider. A configured startup list can open automatically. Firefox declares
required `browsingActivity` and `searchTerms` consent and checks the grants before
opening. These transmissions provide the opening/search function.

Browser-account sync uploads have been removed. The extension can read existing
legacy/preview sync caches for migration backups and explicit local recovery;
it does not upload, overwrite or clear account storage. Optional settings-data
consent is no longer requested. JSON export/import transfers lists between
installations.

Migration reads existing extension page storage, local mirrors and old sync
copies. It requires explicit review and does not run at startup. Original raw
stores, migration backups and stages are preserved locally. New saves use
separate checksummed list/settings/metadata records, reusing unchanged content.
Independent recovery checkpoints retain the current save and one preceding
verified save. Cleanup failures keep extra records for a later retry.

Automatic and manual snapshot capture have been removed. Existing snapshot
archives remain recoverable. Earlier preview history can be removed only after
a user downloads a full recovery archive, selects that file for read-back
verification and explicitly authorizes compaction. Records still needed by
retained or pending saves remain protected. This maintenance never deletes
original migration backups, damaged records or unresolved inputs. New finished
job history has bounded retention as described below; unfinished work and tabs
waiting to load remain protected.

A user can set aside an interrupted save after selecting a matching full recovery
archive and explicitly confirming. The inactive records remain locally protected
by a checksummed quarantine receipt, and editing resumes from the last saved
library. This does not restore an unreadable active library automatically.

Working popup text uses a separate local record. Concurrent conflicting drafts
and editor handoffs are retained. Imports/restores replace only lists and
preferences after review; current drafts/jobs remain and imported jobs never
replay. Unresolved import reviews are protected. Applied plain lists/settings sources
remain while their checkpoint is retained and can then be collected with obsolete
checkpoints. Recovery/legacy import originals stay protected: they may contain
backups, damaged records or unresolved work outside the active library. Original
migration backups remain separate and protected.

Opening plans, inputs, omitted-entry reports, progress and tab receipts use
local extension storage for recovery. New progress retains its current and
preceding verified snapshots. Finished history keeps up to ten recent results
under a 1 MiB size target; the newest result is kept even if larger. Unfinished,
uncertain and cancelled jobs and live/unsettled holding tabs remain protected.
Older preview jobs require verified external archival before eligible removal.
Opaque request-scope metadata prevents an expired retry from reopening a batch.
Each retained job keeps its opening preferences.
Opaque startup/session metadata uses browser session storage. Held-tab helper
URLs contain opaque references; the browser performs destination navigation.

Private access requires the browser's private-window permission. A private
workspace starts with regular saved lists/preferences, excluding regular drafts
and staging. Its edits, drafts, recovery records and jobs use temporary Firefox
session storage or Chromium's isolated incognito IndexedDB partition. Closing
the last private window clears that workspace; browser restart or extension
reload can also clear it. Private/regular capture stay separate. Private data is
not written to persistent local/account storage. Startup and global menu
preferences are managed from regular windows; global menus show regular lists.
Private sessions cannot perform persistent migration, preview-history compaction
or recover old account caches. Explicit copy/download can outlast the session.

Recovery downloads are user-requested local JSON archives. They can contain
names, URLs, searches, preferences, drafts, jobs and damaged records. New archives
use gzip/base64 inside JSON and checksums. They are **not encrypted**; keep them
private. Imports support up to 64 MiB decoded JSON and 16 MiB compressed data.
A normal portable/compatibility export contains lists/preferences and excludes
drafts, jobs and history. No files/profiles are sent to this public repository.

Clipboard writes and downloads require user actions. The extension does not
read the clipboard. Diagnostics are prepared for review before sharing and
exclude saved names, destinations, drafts, job/recovery bodies and actual saved
list references in preferences. Nothing is sent automatically to the developer.

Active data, protected originals and unresolved work still need finite browser
storage. Uninstalling or clearing extension data can remove it; keep independent
recovery files or backed-up profiles before upgrade testing. Linux automation
does not establish signed-store upgrades, native assistive-technology usability
or every OS/browser combination. Store disclosures require final review.

The preview requests `storage`, `tabs`, `alarms` and `contextMenus`, with no broad
host access. `tabs` supports capturing open-tab URLs; no browsing-history API is
requested.
