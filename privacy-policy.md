# Bulk URL Opener Privacy Policy

This policy describes the unreleased `redevelopment` preview through Phase 3.
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
startup. This phase does not upload to browser sync.

Opening plans, inputs, omitted-entry reports, progress, tab receipts and data
mutation history are retained in local extension storage for recovery. A job
keeps its settings snapshot. Opaque startup/session metadata is held in browser
session storage. Held-tab helper URLs contain opaque references rather than the
destination URL. Actual destination navigation is performed by the browser.

Private-window jobs and capture are unavailable in this preview. Private
senders/targets are refused before persistent job creation, private tab URLs are
omitted from capture, and private-document migration is refused. Session-only
private handling requires further implementation/testing before release.

Recovery downloads are user-requested local JSON files. They can contain list
names, URLs, searches, preferences, unsaved input and other retained extension
data, including damaged records. Store these files privately. They are not
encrypted; content checksums detect differences rather than protecting secrecy.

Recovery/history remains in the browser profile without automatic pruning.
Uninstalling an extension or clearing its browser data can remove that storage;
keep an independent recovery file or backed-up profile before upgrade testing.
No recovery files or browser profiles are sent to this public source repository.

Later phases will restore the complete UI, optional browser-account sync and
other existing features. Their actual data flows, permission needs and store
declarations require review before release. The Phase 3 preview requests
`storage`, `tabs`, `alarms` and `contextMenus`, with no broad host access.
