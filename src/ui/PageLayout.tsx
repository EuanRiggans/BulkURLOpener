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
        <a href={pageUrl('/popup.html')}>Bulk URL Opener</a>
      </nav>
      <h1>{title}</h1>
      <PreviewNotice />
      {children}
    </main>
  );
}
