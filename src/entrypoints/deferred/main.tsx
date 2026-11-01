import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import * as v from 'valibot';
import { extensionRequest } from '../../infrastructure/browser/client';
import { pageUrl } from '../../infrastructure/browser/pages';
import { PageLayout } from '../../ui/PageLayout';
import { mount } from '../../ui/mount';
import { serviceError } from '../../ui/services/errors';

const parameters = new URLSearchParams(location.search);
const job = parameters.get('job'),
  index = Number(parameters.get('index'));
const response = v.strictObject({
  url: v.string(),
  ready: v.boolean(),
  loaded: v.boolean(),
});
function Deferred() {
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');
  async function load() {
    try {
      const result = await extensionRequest(
        { type: 'buo:service/deferred.load', job, index, navigate: true },
        response,
      );
      setDestination(result.url);
      setError('');
    } catch (reason) {
      setError(serviceError(reason));
    }
  }
  useEffect(() => {
    const trigger = () => {
      void load();
    };
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && changes['buo:v2:job:' + String(job)]) trigger();
    };
    window.addEventListener('focus', trigger);
    document.addEventListener('visibilitychange', trigger);
    browser.storage.onChanged.addListener(changed);
    trigger();
    return () => {
      window.removeEventListener('focus', trigger);
      document.removeEventListener('visibilitychange', trigger);
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);
  return (
    <PageLayout title="Tab waiting to load">
      <p>
        Select this tab in the focused browser window to load its destination.
      </p>
      {destination && <pre>{destination}</pre>}
      {error && <p role="alert">{error}</p>}
      <button
        onClick={() => {
          void load();
        }}
      >
        Load when selected
      </button>
      <p>
        <a href={pageUrl('/opening.html', job ? { job } : {})}>
          Opening job and recovery
        </a>
      </p>
    </PageLayout>
  );
}
mount(<Deferred />);
