import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('mobile operations shell', () => {
  it('renders the primary attention and navigation surfaces', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Today');
    expect(html).toContain('Needs attention');
    expect(html).toContain('Ready for collection');
    expect(html).toContain('Capture');
    expect(html).toContain('Repairs');
    expect(html).toContain('Schedule');
    expect(html).toContain('Preview');
    expect(html).not.toContain('PASS 0');
    expect(html).not.toContain('Foundation online');
  });
});
