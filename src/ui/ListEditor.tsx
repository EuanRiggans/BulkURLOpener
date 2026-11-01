import { useState } from 'preact/hooks';
import { PageLayout } from './PageLayout';

export function ListEditor({ mode }: { mode: 'create' | 'edit' }) {
  const [name, setName] = useState('');
  const [entries, setEntries] = useState('');
  return (
    <PageLayout title={mode === 'create' ? 'New list' : 'Edit list'}>
      <form onSubmit={(event) => event.preventDefault()}>
        <label for="list-name">List name</label>
        <input
          id="list-name"
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
          autoComplete="off"
        />
        <label for="list-entries">URLs and searches</label>
        <p id="entries-hint" class="hint">
          One entry per line.
        </p>
        <textarea
          id="list-entries"
          aria-describedby="entries-hint"
          value={entries}
          rows={12}
          spellcheck={false}
          onInput={(event) => setEntries(event.currentTarget.value)}
        />
        <button type="submit" class="primary" disabled>
          Save list
        </button>
      </form>
    </PageLayout>
  );
}
