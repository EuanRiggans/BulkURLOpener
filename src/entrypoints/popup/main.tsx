import { useRef, useState } from 'preact/hooks';
import { pageUrl } from '../../infrastructure/browser/pages';
import { PreviewNotice } from '../../ui/PreviewNotice';
import { mount } from '../../ui/mount';

function Popup() {
  const [entries, setEntries] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  return (
    <main class="popup">
      <header class="popup-header">
        <h1>Bulk URL Opener</h1>
        <a href={pageUrl('/options.html')} target="_blank" rel="noreferrer">
          Settings
        </a>
      </header>
      <label for="entries">URLs and searches</label>
      <p id="entries-hint" class="hint">
        One entry per line.
      </p>
      <textarea
        ref={textarea}
        id="entries"
        aria-describedby="entries-hint"
        value={entries}
        rows={10}
        spellcheck={false}
        onInput={(event) => setEntries(event.currentTarget.value)}
      />
      <div class="actions">
        <button type="button" class="primary" disabled>
          Open links
        </button>
        <button type="button" disabled>
          Get current tabs
        </button>
        <button
          type="button"
          onClick={() => {
            setEntries('');
            textarea.current?.focus();
          }}
        >
          Clear
        </button>
      </div>
      <label for="saved-lists">Saved lists</label>
      <div class="saved-list-controls">
        <select id="saved-lists" disabled>
          <option>No lists loaded</option>
        </select>
        <button type="button" disabled>
          Load
        </button>
        <a
          class="button"
          href={pageUrl('/new-list.html')}
          target="_blank"
          rel="noreferrer"
        >
          New list
        </a>
        <button type="button" disabled>
          Edit
        </button>
        <button type="button" disabled>
          Delete
        </button>
      </div>
      <PreviewNotice />
    </main>
  );
}

mount(<Popup />);
