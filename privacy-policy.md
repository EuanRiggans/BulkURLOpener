# Bulk URL Opener Privacy Policy

This policy describes the unreleased `redevelopment` preview through Phase 2.
It is not a statement that the preview has replaced a published store version.

The preview processes extension data locally. It does not send saved lists,
preferences, drafts or recovery records to the developer, an analytics service
or another application server. It introduces no telemetry or remote fonts.

The settings page can read the extension's existing page storage, background
mirrors and browser-account sync cache to prepare a recovery backup. It writes
verified migration, staging and history records to the browser's local extension
storage. Original legacy stores, sync copies and snapshots are not deleted or
overwritten. Migration requires an explicit review action; it does not run at
startup. This phase does not upload to browser sync or open saved destinations.

Recovery downloads are user-requested local JSON files. They can contain list
names, URLs, searches, preferences, unsaved input and other retained extension
data, including damaged records. Store these files privately. They are not
encrypted; content checksums detect differences rather than protecting secrecy.

Recovery/history remains in the browser profile without automatic pruning.
Uninstalling an extension or clearing its browser data can remove that storage;
keep an independent recovery file or backed-up profile before upgrade testing.
No recovery files or browser profiles are sent to this public source repository.

Later phases will restore batch opening, searches, optional browser-account sync
and other existing features. Their actual data flows, permission needs and store
declarations require review before release. The Phase 2 preview requests only
the `storage` permission and has no broad host access.
