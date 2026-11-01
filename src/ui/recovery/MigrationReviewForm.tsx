import type { Decisions, MigrationReview } from '../../domain/storage/schema';
import { createCandidate } from '../../domain/storage/migrate';
import {
  preferenceLabel,
  recoveryError,
  settingLabels,
  sourceLabel,
} from './labels';

export function MigrationReviewForm({
  review,
  decisions,
  onDecisions,
  onCommit,
  busy,
}: {
  review: MigrationReview;
  decisions: Decisions;
  onDecisions: (value: Decisions) => void;
  onCommit: () => void;
  busy: boolean;
}) {
  const { plan } = review;
  let valid = false;
  let guidance = '';
  try {
    createCandidate(plan, decisions);
    valid = true;
  } catch (error) {
    guidance =
      error instanceof Error && error.message === 'REFERENCE_UNAVAILABLE'
        ? recoveryError(error)
        : 'Choose every conflicting preference and historical-record action, and acknowledge all findings before migrating.';
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onCommit();
      }}
    >
      <fieldset disabled={busy}>
        <legend>Review before migration</legend>
        {review.resumeDecisions && (
          <p role="status">
            An interrupted migration was found. Your previous choices are
            restored below. Confirm them to resume without replacing that staged
            state.
          </p>
        )}
        <p>
          The raw backup was read back and verified. All readable list versions
          are shown below. No source is assumed to be newest.
        </p>
        <h3>Saved lists ({plan.lists.length})</h3>
        {plan.lists.length === 0 && (
          <p>
            No readable active lists were found. Archived or damaged data
            remains in recovery.
          </p>
        )}
        {plan.lists.map((list) => (
          <div class="review-record" key={list.id}>
            <details>
              <summary>
                {list.name || '(Unnamed list)'} · {list.lines.length} entries ·
                old ID {list.legacyId}
              </summary>
              <p class="hint">{list.sources.map(sourceLabel).join(', ')}</p>
              <pre>{list.lines.join('\n')}</pre>
            </details>
            {list.reconstructed && (
              <>
                <label for={'historical-' + list.id}>
                  This old comma-separated record needs a decision
                </label>
                <select
                  id={'historical-' + list.id}
                  required
                  value={decisions.historical[list.id] ?? ''}
                  onChange={(event) =>
                    onDecisions({
                      ...decisions,
                      historical: {
                        ...decisions.historical,
                        [list.id]: event.currentTarget.value,
                      },
                    })
                  }
                >
                  <option value="" disabled>
                    Choose after reviewing the split above
                  </option>
                  <option value="include">
                    Include the reconstructed list
                  </option>
                  <option value="archive-only">
                    Keep the original in recovery only
                  </option>
                </select>
              </>
            )}
          </div>
        ))}
        <h3>Preferences</h3>
        {plan.preferences.map(({ key, options }) => (
          <div class="review-record" key={key}>
            {options.length > 1 ? (
              <>
                <label for={'preference-' + key}>
                  {settingLabels[key]} — choose a value
                </label>
                <select
                  id={'preference-' + key}
                  required
                  value={decisions.preferences[key] ?? ''}
                  onChange={(event) =>
                    onDecisions({
                      ...decisions,
                      preferences: {
                        ...decisions.preferences,
                        [key]: event.currentTarget.value,
                      },
                    })
                  }
                >
                  <option value="" disabled>
                    Conflicting copies — choose explicitly
                  </option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {preferenceLabel(option.value, plan)} (
                      {option.sources.map(sourceLabel).join(', ')})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p>
                <strong>{settingLabels[key]}:</strong>{' '}
                {options[0]
                  ? preferenceLabel(options[0].value, plan)
                  : 'Unavailable'}
              </p>
            )}
            <p class="hint">
              {options
                .flatMap((option) => option.sources)
                .map(sourceLabel)
                .filter((item, index, all) => all.indexOf(item) === index)
                .join(', ')}
            </p>
          </div>
        ))}
        <h3>Recovery-only data</h3>
        <p>
          {plan.draftLines?.length ?? 0} previous draft lines;{' '}
          {plan.recoveredInputs.length} staged inputs; {plan.archives.length}{' '}
          sync or snapshot archives.
        </p>
        <p>
          Previous draft lines and readable staged inputs are preserved. Staged
          URLs will not open automatically. Sync copies, snapshots and
          unreadable records stay in the recovery backup.
        </p>
        {plan.archives.length > 0 && (
          <ul>
            {plan.archives.map((archive) => (
              <li key={archive.source}>
                {archive.kind === 'sync' ? 'Sync copy' : 'Snapshot'}:{' '}
                {archive.valid
                  ? String(archive.listCount) + ' readable lists'
                  : 'damaged; original retained'}
              </li>
            ))}
          </ul>
        )}
        {plan.issues.length > 0 && (
          <>
            <details open>
              <summary>
                {plan.issues.length} findings need acknowledgement
              </summary>
              <ul>
                {plan.issues.map((issue, index) => (
                  <li key={index}>
                    {issue.detail} <span class="hint">({issue.source})</span>
                  </li>
                ))}
              </ul>
            </details>
            <label class="check-label">
              <input
                type="checkbox"
                checked={decisions.acknowledgeIssues}
                onChange={(event) =>
                  onDecisions({
                    ...decisions,
                    acknowledgeIssues: event.currentTarget.checked,
                  })
                }
              />
              I reviewed these findings and understand that recovery-only
              records remain in the backup.
            </label>
          </>
        )}
        {guidance && (
          <p class="hint" id="migration-guidance">
            {guidance}
          </p>
        )}
        <button
          class="primary"
          type="submit"
          disabled={!valid}
          aria-describedby={guidance ? 'migration-guidance' : undefined}
        >
          Migrate reviewed data
        </button>
      </fieldset>
    </form>
  );
}
