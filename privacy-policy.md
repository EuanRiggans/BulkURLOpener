# Bulk URL Opener Privacy Policy

This policy describes the unreleased `redevelopment` preview through Phase 5 implementation.
It is not a statement that the preview has replaced a published store version.

The preview stores extension data locally and sends no saved lists, preferences,
drafts or recovery records to the developer or an analytics service. It has no
separate collection server, telemetry or remote fonts.

Opening a batch navigates to the destinations chosen by the user. When the
selected non-URL policy is search, the text is sent as a query to the chosen
Google, DuckDuckGo or Bing provider over HTTPS. Saved lists can also open at
browser startup when that preference is enabled. Firefox declares required
`browsingActivity` and `searchTerms` data permissions and checks the grants before
opening. These transmissions implement the opening/search function.

The settings page can read the extension's existing page storage, background
mirrors and browser-account sync cache to prepare a recovery backup. It writes
verified migration, staging and history records to the browser's local extension
storage. Original legacy stores, sync copies and snapshots are not deleted or
overwritten. Migration requires an explicit review action; it does not run at
startup.

The Data & recovery page can upload an explicitly reviewed copy of saved list
names, destinations/search entries and preferences to the browser account's
extension sync service. This is optional and manual; nothing automatically
uploads after a local change. A local copy of previous sync contents is retained
before the modern sync key is replaced. Original legacy sync keys are unchanged.
Firefox consent is checked before upload. The provider manages remote storage,
delivery and account controls. Firefox and Chrome-family accounts do not provide
cross-vendor sync; JSON export/import provides that transfer route. Sync copies
have a conservative 8 KB item limit in this preview.

Opening plans, inputs, omitted-entry reports, progress, tab receipts and data
mutation history are retained in local extension storage for recovery. A job
keeps its settings snapshot. Opaque startup/session metadata is held in browser
session storage. Held-tab helper URLs contain opaque references rather than the
destination URL. Actual destination navigation is performed by the browser.

Working popup text is saved in a separate local record. Conflicting drafts and
new-list handoffs are retained as immutable local copies. Imports and restores
retain the reviewed source locally and replace only saved lists/preferences;
existing drafts/jobs remain, and imported jobs are not replayed. Up to five
optional list/settings snapshots are normally kept. Cleanup failures retain
extra copies; damaged snapshots are kept for recovery. Explicit snapshot purge
removes verified optional copies, not mandatory history or original legacy
archives.

Private access requires the browser's extension permission for private windows.
The private workspace starts with a copy of regular saved lists/preferences,
excluding regular drafts and staging. Its edits, inputs, snapshots and jobs use
temporary browser storage: Firefox session storage or Chromium's isolated
incognito IndexedDB partition. They clear when the last private window closes;
browser restart or extension reload can also clear that temporary storage.
Private and regular capture are separated. Private data does not automatically
enter local storage or account sync. Startup and global context-menu preferences
are managed from regular windows; the global menu lists regular saved lists.
Private sessions cannot upload sync data or perform persistent migration.
Explicit copy/download actions can create files or clipboard content that outlast
the private session.

Recovery downloads are user-requested local JSON files. They can contain list
names, URLs, searches, preferences, unsaved input and other retained extension
data, including damaged records. Store these files privately. They are not
encrypted; content checksums detect differences rather than protecting secrecy.

Normal portable and compatibility exports include lists/preferences and exclude
drafts, jobs and recovery history. Clipboard writes and file downloads occur only
after a user action. The extension does not read the clipboard. Diagnostics are
prepared for review before copying/downloading and omit saved names, destinations,
drafts, job/recovery contents and actual saved-list references in preferences.

Recovery/history remains in the browser profile without automatic pruning.
Uninstalling an extension or clearing its browser data can remove that storage;
keep an independent recovery file or backed-up profile before upgrade testing.
No recovery files or browser profiles are sent to this public source repository.

Phase 5 includes Linux browser checks for private isolation and cleanup. Other
platforms, remote cross-device delivery and genuine same-identity upgrades still
require verification before release. Store declarations require final review.
The Phase 5 preview requests
`storage`, `tabs`, `alarms` and `contextMenus`, with no broad host access.
