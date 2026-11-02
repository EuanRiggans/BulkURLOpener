import { browser } from 'wxt/browser';
import { pageUrl } from '../../infrastructure/browser/pages';
import { PageLayout } from '../../ui/PageLayout';
import { mount } from '../../ui/mount';
import { RecoveryPanel } from '../../ui/recovery/RecoveryPanel';
import { ServiceControls } from '../../ui/services/ServiceControls';
import { SettingsForm } from '../../ui/services/SettingsForm';

function Options() {
  return (
    <PageLayout title="Settings">
      <SettingsForm />
      <p>
        <a href={pageUrl('/data.html')}>
          Import, export, browser sync and snapshots
        </a>
      </p>
      <RecoveryPanel />
      <ServiceControls />
      <p class="hint">Version {browser.runtime.getManifest().version}</p>
    </PageLayout>
  );
}

mount(<Options />);
