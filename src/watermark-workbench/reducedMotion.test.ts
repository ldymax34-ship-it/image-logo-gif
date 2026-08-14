import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function loadCss(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('reduced-motion CSS contract', () => {
  const css = loadCss('src/watermark-workbench/watermarkWorkbench.css');

  it('contains a prefers-reduced-motion block that zeroes transition and animation', () => {
    expect(css).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reduced).toContain('transition: none');
    expect(reduced).toContain('animation: none');
  });

  it('covers the Radix Select/Tooltip/Collapsible content selectors', () => {
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reduced).toMatch(/\.wm-select-content/);
    expect(reduced).toMatch(/\.wm-tooltip-content/);
    expect(reduced).toMatch(/\.wm-collapsible-content/);
  });

  it('does not animate the Canvas preview surface', () => {
    // The Canvas surface must never be animated, even outside reduced-motion.
    const canvasRules = css
      .split('}')
      .filter((rule) => /\.wm-canvas-wrap|\.board-canvas|\.preview-canvas|\.canvas-container/.test(rule));
    for (const rule of canvasRules) {
      expect(rule).not.toMatch(/transition\s*:/);
      expect(rule).not.toMatch(/animation\s*:/);
    }
  });
});
