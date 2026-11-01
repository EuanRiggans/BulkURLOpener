import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import './styles.css';

export function mount(content: ComponentChildren): void {
  const root = document.getElementById('app');
  if (!root)
    throw new Error('The extension page is missing its application root.');
  render(content, root);
}
