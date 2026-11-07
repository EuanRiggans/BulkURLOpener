import { useEffect, useRef, useState } from 'preact/hooks';
import { type TransferReview as Review } from '../../domain/workspace-schema';
import { type Decisions } from '../../domain/storage/schema';
import { MigrationReviewForm } from '../recovery/MigrationReviewForm';
import { settingLabels } from '../recovery/labels';
import { newRequestId } from '../../shared/ids';
export function TransferReview({
  review,
  busy,
  apply,
  cancel,
}: {
  review: Review;
  busy: boolean;
  apply: (operation: string, decisions: Decisions) => void;
  cancel: () => void;
}) {
  const operation = useRef(newRequestId());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [review.id]);
  const [ack, setAck] = useState(false);
  const [decisions, setDecisions] = useState<Decisions>({
    acknowledgeIssues: false,
    preferences: {},
    historical: {},
  });
  return (
    <section aria-labelledby="transfer-title" class="transfer-review">
      <h2 id="transfer-title" tabIndex={-1} ref={heading}>
        Review replacement
      </h2>
      <p>
        Accepting replaces the active saved lists and settings. The working
        draft and opening jobs are kept. URLs are not opened. The original
        import stays locally while its recovery checkpoint is retained. Keep the
        external file if you need its full contents for longer.
      </p>
      <label class="check-label">
        <input
          type="checkbox"
          checked={ack}
          disabled={busy}
          onChange={(event) => setAck(event.currentTarget.checked)}
        />
        I understand that this replaces the current saved lists and settings.
      </label>
      {review.portable && (
        <>
          <h3>{review.portable.lists.length} saved lists</h3>
          {review.portable.lists.map((list) => (
            <details key={list.id}>
              <summary>
                {list.name || '(Unnamed list)'} · {list.lines.length} entries
              </summary>
              <pre>{list.lines.join('\n')}</pre>
            </details>
          ))}
          <details>
            <summary>All imported preferences</summary>
            <dl>
              {Object.entries(review.portable.settings).map(([key, value]) => (
                <div key={key}>
                  <dt>{settingLabels[key as keyof typeof settingLabels]}</dt>
                  <dd>
                    {typeof value === 'string' && value.startsWith('list-')
                      ? review.portable?.lists.find((list) => list.id === value)
                          ?.name
                      : value === null
                        ? 'None'
                        : typeof value === 'boolean'
                          ? value
                            ? 'On'
                            : 'Off'
                          : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <button
            type="button"
            class="primary"
            disabled={busy || !ack}
            onClick={() => apply(operation.current, decisions)}
          >
            Replace lists and settings
          </button>
        </>
      )}
      {review.legacy && (
        <MigrationReviewForm
          transfer
          review={{
            backupDigest: review.id,
            baseHead: review.baseHead,
            resumeDecisions: null,
            plan: review.legacy,
          }}
          decisions={decisions}
          onDecisions={setDecisions}
          onCommit={() => apply(operation.current, decisions)}
          busy={busy || !ack}
        />
      )}
      <p>
        <button type="button" disabled={busy} onClick={cancel}>
          Cancel review
        </button>
      </p>
    </section>
  );
}
