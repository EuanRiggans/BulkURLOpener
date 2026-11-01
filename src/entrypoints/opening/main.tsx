import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import * as v from 'valibot';
import {
  jobViewSchema,
  type JobControl,
  type JobView,
} from '../../domain/opening/schema';
import { extensionRequest } from '../../infrastructure/browser/client';
import { pageUrl } from '../../infrastructure/browser/pages';
import { PageLayout } from '../../ui/PageLayout';
import { mount } from '../../ui/mount';
import { serviceError } from '../../ui/services/errors';

const labels = {
  queued: 'Waiting',
  running: 'Opening',
  paused: 'Paused',
  'needs-review': 'Needs review',
  completed: 'Complete',
  cancelled: 'Cancelled',
};
const selected = new URLSearchParams(location.search).get('job');
function Jobs() {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read() {
      try {
        const result = await extensionRequest(
          { type: 'buo:service/jobs.list' },
          v.array(jobViewSchema),
        );
        if (mounted) setJobs(result);
      } catch (reason) {
        if (mounted) setError(serviceError(reason));
      }
    }
    function changed(changes: Record<string, unknown>, area: string) {
      if (
        area !== 'local' ||
        !Object.keys(changes).some((key) => key.startsWith('buo:v2:job:'))
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void read();
      }, 150);
    }
    browser.storage.onChanged.addListener(changed);
    void read();
    return () => {
      mounted = false;
      clearTimeout(timer);
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);
  async function control(job: JobView, action: JobControl) {
    setBusy(true);
    setError('');
    try {
      await extensionRequest(
        {
          type: 'buo:service/jobs.control',
          id: job.plan.id,
          revision: job.run.revision,
          control: action,
        },
        jobViewSchema,
      );
      setJobs(
        await extensionRequest(
          { type: 'buo:service/jobs.list' },
          v.array(jobViewSchema),
        ),
      );
    } catch (reason) {
      setError(serviceError(reason));
    } finally {
      setBusy(false);
    }
  }
  const visible = selected
    ? jobs.filter((job) => job.plan.id === selected)
    : jobs;
  return (
    <PageLayout title="Opening jobs">
      <p>
        Plans and progress are retained locally. Interrupted tab creation needs
        review because a tab may have opened before its acknowledgement was
        saved.
      </p>
      {error && <p role="alert">{error}</p>}
      {!visible.length && (
        <p role="status">No opening jobs are available here.</p>
      )}
      {visible.map((job) => (
        <section key={job.plan.id} aria-label="Opening job">
          <h2>
            {job.plan.trigger === 'startup'
              ? 'Browser startup'
              : job.plan.trigger === 'context-menu'
                ? 'Saved list from context menu'
                : 'Opening batch'}
          </h2>
          <p role="status">
            {labels[job.run.status]} · {job.run.cursor} of{' '}
            {job.plan.destinations.length} entries recorded
          </p>
          <progress
            max={Math.max(1, job.plan.destinations.length)}
            value={job.run.cursor}
            aria-label="Entry progress"
          />
          {job.run.error && (
            <p role="status">{serviceError(new Error(job.run.error))}</p>
          )}
          {job.run.inFlight && (
            <p>
              A browser operation is already in progress. Pause or cancel takes
              effect after that operation finishes.
            </p>
          )}
          <div class="actions">
            {['queued', 'running'].includes(job.run.status) && (
              <button
                disabled={busy}
                onClick={() => {
                  void control(job, { action: 'pause' });
                }}
              >
                Pause
              </button>
            )}
            {job.run.status === 'paused' && (
              <button
                disabled={busy || job.run.inFlight !== null}
                onClick={() => {
                  void control(job, { action: 'resume' });
                }}
              >
                Resume in this window
              </button>
            )}
            {!['completed', 'cancelled'].includes(job.run.status) && (
              <button
                disabled={busy}
                onClick={() => {
                  void control(job, { action: 'cancel' });
                }}
              >
                Cancel remaining entries
              </button>
            )}
          </div>
          {job.run.status === 'needs-review' &&
            job.run.cursor < job.plan.destinations.length && (
              <>
                <p>
                  Check existing tabs first. Retrying can create a duplicate.
                </p>
                <div class="actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      void control(job, { action: 'assume-opened' });
                    }}
                  >
                    Record as opened
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      void control(job, { action: 'skip' });
                    }}
                  >
                    Skip this entry
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      void control(job, { action: 'retry' });
                    }}
                  >
                    Retry and resume
                  </button>
                </div>
              </>
            )}
          {job.run.status === 'needs-review' &&
            job.run.cursor === job.plan.destinations.length && (
              <div class="actions">
                <button
                  disabled={busy}
                  onClick={() => {
                    void control(job, { action: 'retry-activation' });
                  }}
                >
                  Retry final-tab activation
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    void control(job, { action: 'finish' });
                  }}
                >
                  Finish without activation
                </button>
              </div>
            )}
          <details>
            <summary>Entries and recorded results</summary>
            <ol>
              {job.plan.destinations.map((entry, index) => (
                <li key={index}>
                  <span>
                    {job.receipts[index]?.kind ??
                      (job.run.cursor === index
                        ? 'Pending or unconfirmed'
                        : 'Pending')}
                  </span>
                  <pre>{entry.url}</pre>
                </li>
              ))}
            </ol>
          </details>
          {!!job.plan.rejected.length && (
            <details>
              <summary>
                {job.plan.rejected.length} input entries were not opened
              </summary>
              <ul>
                {job.plan.rejected.map((entry) => (
                  <li key={entry.inputIndex}>
                    {entry.reason.replaceAll('-', ' ')}
                    <pre>{entry.input}</pre>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
      <p>
        <a href={pageUrl('/opening.html')}>All opening jobs</a> ·{' '}
        <a href={pageUrl('/options.html')}>Settings and recovery</a>
      </p>
    </PageLayout>
  );
}
const notice = new URLSearchParams(location.search).get('notice');
mount(
  notice ? (
    <PageLayout title="Opening unavailable">
      <p role="alert">
        {notice === 'private'
          ? serviceError(new Error('PRIVATE_WINDOW_UNSUPPORTED'))
          : 'The request could not be completed. Check data migration, Firefox consent and the saved opening jobs in Settings.'}
      </p>
    </PageLayout>
  ) : (
    <Jobs />
  ),
);
