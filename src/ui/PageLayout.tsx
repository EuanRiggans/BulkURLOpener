import type { ComponentChildren } from 'preact';
import { pageUrl } from '../infrastructure/browser/pages';
import { PreviewNotice } from './PreviewNotice';

export function PageLayout({
  title,
  children,
}: {
  title: string;
  children: ComponentChildren;
}) {
  return (
    <main class="full-page">
      <nav aria-label="Main navigation">
        <a href={pageUrl('/popup.html')}>Opener</a>
        <a href={pageUrl('/options.html')}>Settings</a>
        <a href={pageUrl('/data.html')}>Data & recovery</a>
        <a href={pageUrl('/tools.html')}>Tools</a>
        <a href={pageUrl('/opening.html')}>Opening jobs</a>
        <a href={pageUrl('/help.html')}>Help</a>
      </nav>
      <h1>{title}</h1>
      <PreviewNotice />
      {children}
    </main>
  );
}
