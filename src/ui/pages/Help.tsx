import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { jsonObjectSchema } from '../../domain/storage/json';
import { extensionRequest } from '../../infrastructure/browser/client';
import { pageUrl } from '../../infrastructure/browser/pages';
import { PageLayout } from '../../ui/PageLayout';
import { copyText, downloadText } from '../../ui/services/workspace';
import { serviceError } from '../../ui/services/errors';

export function Help() {
  const [diagnostics, setDiagnostics] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const manifest = browser.runtime.getManifest();
  return (
    <PageLayout title="Help & about">
      <p>
        <strong>Bulk URL Opener {manifest.version}</strong> · Browser extension
        · MIT licence
      </p>
      <section aria-labelledby="quickstart-title">
        <h2 id="quickstart-title">Getting started</h2>
        <ol>
          <li>
            For an existing installation, review data migration in{' '}
            <a href={pageUrl('/options.html')}>Settings</a>. Keep a recovery
            download first.
          </li>
          <li>
            Enter one URL or search per line in the opener and choose{' '}
            <strong>Open links</strong>. Review progress and rejected entries on
            the opening-jobs page.
          </li>
          <li>
            Use <strong>New</strong> or <strong>Edit</strong> to manage lists on
            a separate page. Select a list and choose <strong>Load</strong> to
            put its entries in the textarea.
          </li>
        </ol>
      </section>
      <section aria-labelledby="faq-title">
        <h2 id="faq-title">Frequently asked questions</h2>
        <details>
          <summary>How do delays, pause and resume work?</summary>
          <p>
            Set a delay in seconds, including fractions, in Settings. Closing
            the popup does not cancel a job. Use{' '}
            <a href={pageUrl('/opening.html')}>Opening jobs</a> to pause, resume
            or cancel remaining entries. After an interruption, check existing
            tabs before retrying an unconfirmed entry; a retry may create a
            duplicate.
          </p>
        </details>
        <details>
          <summary>Can selecting a list open it automatically?</summary>
          <p>
            Enable automatic opening in Settings. The popup shows a temporary
            pause checkbox whenever that option is enabled. Loading the initial
            popup contents never opens them automatically. Automatic loading is
            a separate preference.
          </p>
        </details>
        <details>
          <summary>What does load-on-focus do?</summary>
          <p>
            Each new tab initially shows a holding page. The destination loads
            when that tab is selected in a focused window. Destination addresses
            stay out of helper-page URLs.
          </p>
        </details>
        <details>
          <summary>Why are some entries omitted or rejected?</summary>
          <p>
            Choose whether non-URLs are searched, ignored or extracted. Unsafe
            navigation schemes are blocked. Duplicate removal compares
            normalized destination URLs before reversing the opening order. The
            progress page records rejected inputs. File URLs and
            browser-internal pages may still be refused by the browser.
          </p>
        </details>
        <details>
          <summary>How do I transfer lists to another browser?</summary>
          <p>
            Use a JSON export and inspect it before import. Browser-account sync
            has been removed. Existing sync copies can still be inspected and
            recovered locally on the Data page.
          </p>
        </details>
        <details>
          <summary>Where is my data stored?</summary>
          <p>
            Lists, drafts, jobs and recovery records are held in local extension
            storage. Saves reuse unchanged list records and retain up to five
            internal recovery checkpoints within a size budget. Automatic
            snapshots have been removed. Opening a URL contacts that
            destination; searches go to the selected provider. No analytics or
            developer collection service is used. Recovery files may contain
            private content; keep them private.
          </p>
        </details>
        <details>
          <summary>Can I use private windows?</summary>
          <p>
            Allow the extension in private windows using your browser's
            extension settings. A private workspace starts with a copy of
            regular saved lists and preferences. Its drafts, edits, recovery
            records and opening jobs stay in temporary private storage and clear
            when the last private window closes. Startup and recovery of old
            sync copies use regular windows.
          </p>
        </details>
        <details>
          <summary>How do I use the context menu or shortcut?</summary>
          <p>
            Enable saved-list context menus in Settings, then use Bulk URL
            Opener → Open Lists → your list. Configure the extension action
            shortcut in your browser's extension shortcut settings. A separate
            opener window is available under More in the popup.
          </p>
        </details>
        <details>
          <summary>How are updates installed?</summary>
          <p>
            Store versions are updated by the browser's extension system. This
            redevelopment preview is not a store release. Review the source
            changelog or official listing for update information.
          </p>
        </details>
      </section>
      <section aria-labelledby="links-title">
        <h2 id="links-title">Project and release information</h2>
        <ul class="resource-links">
          <li>
            <a
              href="https://github.com/EuanRiggans/BulkURLOpener"
              target="_blank"
              rel="noreferrer"
            >
              Source code
            </a>
          </li>
          <li>
            <a
              href="https://github.com/EuanRiggans/BulkURLOpener/issues"
              target="_blank"
              rel="noreferrer"
            >
              Report an issue
            </a>
          </li>
          <li>
            <a
              href="https://github.com/EuanRiggans/BulkURLOpener/blob/redevelopment/CHANGELOG.md"
              target="_blank"
              rel="noreferrer"
            >
              Release history
            </a>
          </li>
          <li>
            <a
              href="https://addons.mozilla.org/firefox/addon/bulkurlopener/"
              target="_blank"
              rel="noreferrer"
            >
              Firefox listing
            </a>{' '}
            ·{' '}
            <a
              href="https://chromewebstore.google.com/detail/kgnfciolbjojfdbbelbdbhhocjmhenep"
              target="_blank"
              rel="noreferrer"
            >
              Chrome listing
            </a>{' '}
            ·{' '}
            <a
              href="https://microsoftedge.microsoft.com/addons/detail/bulk-url-opener/cfopcknfhpogkpcnnppcaedkhokachoo"
              target="_blank"
              rel="noreferrer"
            >
              Edge listing
            </a>{' '}
            ·{' '}
            <a
              href="https://addons.opera.com/en-gb/extensions/details/bulk-url-opener-2/"
              target="_blank"
              rel="noreferrer"
            >
              Opera listing
            </a>
          </li>
          <li>
            <a
              href="https://github.com/EuanRiggans/BulkURLOpener/blob/redevelopment/privacy-policy.md"
              target="_blank"
              rel="noreferrer"
            >
              Preview privacy policy
            </a>
          </li>
        </ul>
      </section>
      <section aria-labelledby="diagnostics-title">
        <h2 id="diagnostics-title">Diagnostics</h2>
        <p>
          Prepare a report to review before sharing. Saved names, URLs,
          searches, drafts and recovery contents are excluded. Saved-list
          preference references are replaced with a generic label.
        </p>
        <button
          onClick={() => {
            setError('');
            void extensionRequest(
              { type: 'buo:service/diagnostics' },
              jsonObjectSchema,
            )
              .then((data) =>
                setDiagnostics(
                  JSON.stringify(
                    {
                      extensionVersion: manifest.version,
                      manifestVersion: manifest.manifest_version,
                      ...data,
                    },
                    null,
                    2,
                  ),
                ),
              )
              .catch((reason: unknown) => setError(serviceError(reason)));
          }}
        >
          Prepare report
        </button>
        {diagnostics && (
          <>
            <label for="diagnostic-report">Report to review</label>
            <textarea
              id="diagnostic-report"
              rows={12}
              value={diagnostics}
              readOnly
              spellcheck={false}
            />
            <div class="actions">
              <button
                onClick={() => {
                  void copyText(diagnostics)
                    .then(() => setNotice('Report copied.'))
                    .catch(() =>
                      setError(
                        'Copy was unavailable. Select the report text or download it.',
                      ),
                    );
                }}
              >
                Copy report
              </button>
              <button
                onClick={() =>
                  downloadText(diagnostics, 'bulk-url-opener-diagnostics.json')
                }
              >
                Download report
              </button>
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <p role="status">{notice}</p>
      </section>
    </PageLayout>
  );
}
