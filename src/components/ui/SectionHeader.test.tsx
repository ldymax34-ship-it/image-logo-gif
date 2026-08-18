import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('renders a flat section title band without decorative state dots', () => {
    const html = renderToStaticMarkup(<SectionHeader id="logo-controls-title" title="Logo" description="组合与单项资源" state="idle" />);
    expect(html).toContain('section-header');
    expect(html).toContain('组合与单项资源');
    expect(html).not.toContain('section-state-dot');
  });
});
