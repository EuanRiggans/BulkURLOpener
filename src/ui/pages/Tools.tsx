import { useState } from 'preact/hooks';
import { extractUrls } from '../../domain/opening/urls';
import { draftResultSchema } from '../../domain/workspace-schema';
import { extensionRequest } from '../../infrastructure/browser/client';
import { pageUrl } from '../../infrastructure/browser/pages';
import { newRequestId } from '../../shared/ids';
import { PageLayout } from '../../ui/PageLayout';
import {
  copyText,
  downloadText,
  openPage,
  readWorkspace,
} from '../../ui/services/workspace';
import { serviceError } from '../../ui/services/errors';

export function Tools() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'extract' | 'reverse'>('extract');
  const [unique, setUnique] = useState(false);
  const [ignoreEmpty, setIgnoreEmpty] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  let lines =
    mode === 'extract'
      ? extractUrls(input)
      : input.split(/\r\n|\r|\n/).reverse();
  if (unique) lines = [...new Set(lines)];
  if (ignoreEmpty) lines = lines.filter((line) => line.length > 0);
  const output = lines.join('\n');
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (reason) {
      setError(serviceError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageLayout title="Text tools">
      <p>
        Extract URLs from text or reverse line order. Input stays on this page
        until you choose to copy, download or use the result.
      </p>
      <label for="tool-mode">Tool</label>
      <select
        id="tool-mode"
        value={mode}
        onChange={(event) =>
          setMode(event.currentTarget.value as 'extract' | 'reverse')
        }
      >
        <option value="extract">Extract URLs</option>
        <option value="reverse">Reverse lines</option>
      </select>
      <label for="tool-input">Input</label>
      <textarea
        id="tool-input"
        value={input}
        rows={10}
        spellcheck={false}
        onInput={(event) => setInput(event.currentTarget.value)}
      />
      <label class="check-label">
        <input
          type="checkbox"
          checked={unique}
          onChange={(event) => setUnique(event.currentTarget.checked)}
        />
        Remove identical results
      </label>
      <label class="check-label">
        <input
          type="checkbox"
          checked={ignoreEmpty}
          onChange={(event) => setIgnoreEmpty(event.currentTarget.checked)}
        />
        Omit empty lines
      </label>
      <label for="tool-output">Result</label>
      <p class="hint">
        {mode === 'extract'
          ? 'Every recognized URL is extracted, including multiple URLs on a line. Schemes and browser restrictions follow the shared URL policy.'
          : 'Spaces and empty lines are preserved unless you choose to omit empty lines.'}
      </p>
      <textarea
        id="tool-output"
        value={output}
        rows={10}
        spellcheck={false}
        readOnly
      />
      <div class="actions">
        <button
          disabled={busy || !output}
          onClick={() =>
            void perform(async () => {
              await copyText(output);
              setNotice('Result copied.');
            })
          }
        >
          Copy result
        </button>
        <button
          disabled={!output}
          onClick={() =>
            downloadText(output, 'bulk-url-opener-result.txt', 'text/plain')
          }
        >
          Download text
        </button>
        <button
          disabled={busy || !output}
          onClick={() =>
            void perform(async () => {
              const state = await readWorkspace();
              const result = await extensionRequest(
                {
                  type: 'buo:service/draft.freeze',
                  input: {
                    client: newRequestId(),
                    sequence: 1,
                    base: state.draft.head,
                    lines,
                  },
                },
                draftResultSchema,
              );
              if (!result.saved) throw new Error('REVISION_CONFLICT');
              await openPage(
                pageUrl('/popup.html', { draft: result.submitted }),
              );
            })
          }
        >
          Use in opener
        </button>
        <button
          onClick={() => {
            setInput('');
            setNotice('');
          }}
        >
          Clear input
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? 'Working…' : notice}</p>
    </PageLayout>
  );
}
