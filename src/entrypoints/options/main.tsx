import { browser } from 'wxt/browser';
import { pageUrl } from '../../infrastructure/browser/pages';
import { PageLayout } from '../../ui/PageLayout';
import { mount } from '../../ui/mount';

function Options() {
  return (
    <PageLayout title="Settings">
      <p>
        Preferences and saved-list management will be available in a later
        preview.
      </p>
      <p>
        <a href={pageUrl('/new-list.html')}>Create a list</a>
      </p>
      <p class="hint">Version {browser.runtime.getManifest().version}</p>
    </PageLayout>
  );
}

mount(<Options />);
