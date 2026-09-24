import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('foundation shell', () => {
  it('renders the hardened foundation markers', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Elara Relay');
    expect(html).toContain('TS6 + TS7');
    expect(html).toContain('Playwright');
    expect(html).toContain('Adversarial');
  });
});
