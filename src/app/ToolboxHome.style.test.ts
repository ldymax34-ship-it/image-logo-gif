import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const components = readFileSync('src/styles/components.css', 'utf-8');
const toolboxSection = components.slice(components.indexOf('.toolbox-tool-button'));

describe('ToolboxHome style contract', () => {
  it('keeps neutral cards while giving available tools restrained identity tones', () => {
    expect(components).toMatch(/\.toolbox-tool-button\[data-tone='logo'\]/);
    expect(components).toMatch(/\.toolbox-tool-button\[data-tone='watermark'\]/);
    expect(components).toMatch(/\.toolbox-tool-button\[data-tone='video'\]/);
    expect(components).toMatch(/--tool-tone-soft/);
  });

  it('keeps the pointer-follow highlight inside the card and only for enabled cards', () => {
    expect(components).toMatch(/\.toolbox-tool-button::before\s*\{[\s\S]*?position:\s*absolute/);
    expect(components).toMatch(/\.toolbox-tool-button::before\s*\{[\s\S]*?radial-gradient\([\s\S]*?var\(--pointer-x[\s\S]*?var\(--pointer-y/);
    expect(components).toMatch(/\.toolbox-tool-button::before\s*\{[\s\S]*?pointer-events:\s*none/);
    expect(components).toMatch(/\.toolbox-tool-button:hover:not\(:disabled\)::before\s*\{\s*opacity:\s*1/);
    expect(components).toMatch(/\.toolbox-tool-button::after\s*\{[\s\S]*?linear-gradient\(90deg, transparent, rgb\(255 255 255 \/ 18%\)/);
    expect(components).toMatch(/\.toolbox-tool-button:hover:not\(:disabled\)::after\s*\{\s*opacity:\s*1/);
  });

  it('provides a pressed scale affordance around 0.98 for enabled cards only', () => {
    expect(components).toMatch(/\.toolbox-tool-button:active:not\(:disabled\)\s*\{[^}]*transform:\s*scale\(0\.98\)/);
  });

  it('disables transforms, transitions and the highlight under prefers-reduced-motion', () => {
    expect(toolboxSection).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    const reduced = toolboxSection.slice(toolboxSection.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\.toolbox-tool-button/);
    expect(reduced).toContain('transition: none');
    expect(reduced).toContain('transform: none');
    expect(reduced).toMatch(/\.toolbox-tool-button::before\s*\{\s*opacity:\s*0\s*!important/);
    expect(reduced).toMatch(/\.toolbox-tool-button::after\s*\{\s*opacity:\s*0\s*!important/);
  });

  it('raises the homepage card surface locally without touching global tokens', () => {
    expect(components).toMatch(/\.toolbox-home\s*\{[\s\S]*?--toolbox-card-bg:\s*#232328/);
    expect(components).toMatch(/\.toolbox-tool-button\s*\{[\s\S]*?background:\s*var\(--toolbox-card-bg,\s*var\(--color-panel\)\)/);
  });
});
