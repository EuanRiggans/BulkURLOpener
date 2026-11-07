# Store submission draft

Reviewed against public sources on 7 November 2026. This is preparation for an
unreleased candidate, not confirmation that any dashboard has been edited or any
package signed, submitted or approved. Recheck policies and current dashboard
fields at the actual submission date.

## Identities and listing access

| Store   | Existing identity / listing                                                                                                                       | Evidence and remaining check                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firefox | `{c5b32a48-5514-4a46-81f2-075ebf3cbc29}`; [bulkurlopener](https://addons.mozilla.org/firefox/addon/bulkurlopener/)                                | User-confirmed ID and enforced manifest/build check. Public version history shows `1.11.3`. Maintainer must verify candidate signing and the existing listing's update route. |
| Chrome  | `kgnfciolbjojfdbbelbdbhhocjmhenep`; [listing](https://chromewebstore.google.com/detail/bulk-url-opener/kgnfciolbjojfdbbelbdbhhocjmhenep)          | Inherited README link and live public listing (`1.12.1`). Confirm ownership in its dashboard and use an update to this item.                                                  |
| Edge    | `cfopcknfhpogkpcnnppcaedkhokachoo`; [listing](https://microsoftedge.microsoft.com/addons/detail/bulk-url-opener/cfopcknfhpogkpcnnppcaedkhokachoo) | Inherited README link; public page did not expose enough listing metadata to confirm the installed version/ownership. Confirm in the dashboard and on an installed copy.      |
| Opera   | [bulk-url-opener-2](https://addons.opera.com/en-gb/extensions/details/bulk-url-opener-2/)                                                         | Inherited README link; live page could not be inspected. Preserve it pending maintainer verification; do not replace it with a new listing.                                   |

Chromium unpacked IDs depend on development installation details. They do not
prove the signed store identity. No invented manifest key or private signing key
is added. Public listing visibility does not establish account access. This
session has no configured store signing credentials or authenticated browser
accounts; keys, tokens and account identifiers must not enter the repository.
Confirm a store-supported same-ID testing/signing channel and a valid test
version before signing: signing can consume a version even without publication.
Do not assume the preview's `2.0.0` can later be reused unchanged across channels.

## Listing text to review

**Single purpose:** Open batches of user-entered URLs/searches and manage saved
lists for repeated opening.

**Description:** Enter one destination per line, open the batch, or load a saved
list. Capture open-tab URLs, choose a delay/order and manage lists on separate
pages. Settings, manual JSON transfer and recovery
stay outside the simple 540px-preferred-width popup. The context menu is
`Bulk URL Opener > Open Lists > [saved lists]`. Browser restrictions apply to
file, internal and other protected destinations. Private access requires the
browser's grant and uses a separate temporary workspace.

**Update notes:** Browser-only 2.x rebuild; Electron is retired. Existing lists
and preferences migrate only after a backed-up review. Original stores and
original migration backups remain available. Failed/unconfirmed tab opening
needs review instead of automatic replay. Browser-account sync uploads and
snapshot capture have been removed; existing copies remain locally recoverable.
New saves share unchanged data and use bounded recovery checkpoints. Earlier
preview-history cleanup requires a verified downloaded archive and explicit
confirmation. This remains a preview until the release checklist is satisfied.

Replace old desktop screenshots/instructions and inaccurate permission wording.
`tabs` is used to read tab URLs, not to read browsing history or authorize tab
creation. Store-managed updates replace the old remote version-check endpoint.
No claim of mobile support, universal OS support, unlimited storage, guaranteed
cross-device sync or exactly-once recovery belongs in the listing.

## Permission justifications

| Manifest permission | Implemented purpose                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`           | Save lists/preferences/drafts, verified migration/recovery records and durable opening jobs; read-only recovery of previous account caches.                                         |
| `tabs`              | Read the URLs of open tabs for user-requested capture within the current regular/private scope and recover the extension's opaque held-tab references. No history API is requested. |
| `alarms`            | Recover delayed/interrupted opening work when background execution is suspended. Fractional delays also use active execution.                                                       |
| `contextMenus`      | Provide only the basic saved-list opening hierarchy.                                                                                                                                |

There are no broad host permissions, content scripts, web-accessible resources,
remote executable code, injected advertising, analytics SDKs or clipboard reads.
All runtime scripts/styles/fonts are bundled/local. Explain downloads and
clipboard writes as explicit user actions; no `downloads` or clipboard-reading
permission is requested. Keep final generated manifests with reviewer evidence.

## Data declarations

The [privacy policy](../privacy-policy.md) must agree with the package, listing
and dashboard. Do not copy the old blanket “collects no data” statement without
explaining navigation, search and local recovery of old account caches.

| Data / path                                                        | Handling to disclose                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved/captured URLs and search input                               | Stored locally; opening transmits destinations to chosen sites and queries to Google, DuckDuckGo or Bing. A startup list can navigate automatically if configured.                                                                                                                                                                                  |
| List names and all preferences                                     | Local library; included in user-requested JSON exports. No browser-account uploads. Existing account caches remain read-only.                                                                                                                                                                                                                       |
| Working text, jobs, staged imports, conflicts and recovery history | Local storage; protected originals/unresolved work remain. Ordinary checkpoints and new completed jobs have bounded retention; interrupted saves can be quarantined after verified archival; consumed pure lists/settings imports can be collected. Recovery/legacy import originals stay protected. Full recovery downloads may contain all of it. |
| Private workspace                                                  | Temporary Firefox session storage or isolated Chromium incognito IndexedDB. Explicit downloads/copy can outlast the session.                                                                                                                                                                                                                        |
| Internal save checkpoints                                          | One preceding verified save as the internal fallback. Snapshot capture is removed; old copies remain recoverable.                                                                                                                                                                                                                                   |
| Diagnostics                                                        | Prepared for review before copying/downloading; omit saved names/URLs/drafts/jobs/recovery bodies and saved-list references. Nothing automatically sent.                                                                                                                                                                                            |

Firefox declares required `browsingActivity` and `searchTerms` for opening/search.
Explicit corrupted-library recovery retains the selected source and damaged
library records after matching archive read-back and review. It restores
lists/settings locally without installing imported jobs. Include this protected
retention in the disclosure; see [the recovery contract](CORRUPTION_RECOVERY.md).
Optional `technicalAndInteraction` is removed with sync uploads. No
`has_previous_consent` claim is made. Native install/update/refusal prompts still
require signed-build tests.

For Chrome/Edge, disclose browsing destinations and any applicable user-provided
content/preferences in the current dashboard taxonomy. State that use is limited
to the visible extension function, local recovery and user-requested
exports. There is no sale, advertising, developer profiling or developer access
to stored contents. A lack of a developer server does not exempt handled browser
data from privacy disclosures. The maintainer must review the actual selections
and policy URL before submission; dashboard acceptance is not established here.

The previous `euan.link/bulkurlopener-privacy-policy` link/redirect needs a live
check by its owner. Serve the approved policy at a stable public HTTPS location
and update the existing listings to it. This phase changes the repository draft
only, not the public website or dashboard.

## Reviewer bundle

Provide the verified browser ZIP and matching source ZIP/lockfile, Node 24 build
instructions, checksums, bundled MIT notices, migration/upgrade protocol, test
versions/evidence and the narrow Preact vendor-warning explanation. State that
all fixtures are synthetic. For Mozilla, use the reproducible source ZIP when
requested for review. Source and production ZIPs are different artifacts.

## Primary references

- [Firefox data consent and taxonomy](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Mozilla add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Chrome privacy practices fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome user-data FAQ and Limited Use](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Firefox published version history](https://addons.mozilla.org/firefox/addon/bulkurlopener/versions/)

Policy changes announced for December 2026 are not assumed to be effective
already; recheck the applicable version if submission happens after that date.
