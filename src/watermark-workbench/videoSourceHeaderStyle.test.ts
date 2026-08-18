import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/watermark-workbench/watermarkWorkbench.css', 'utf-8');

describe('video source panel header style contract', () => {
  it('stacks the narrow source-panel title and full-width select button on separate rows', () => {
    expect(css).toMatch(/\.wm-video-source-panel \.panel-heading\s*\{[\s\S]*?flex-direction:\s*column/);
    expect(css).toMatch(/\.wm-video-source-panel \.panel-heading\s*\{[\s\S]*?align-items:\s*stretch/);
    expect(css).toMatch(/\.wm-video-source-panel \.panel-heading\s*\{[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/\.wm-video-source-panel \.panel-heading h2\s*\{[\s\S]*?margin:\s*0/);
  });

  it('makes the select button full-width with centered icon and text', () => {
    expect(css).toMatch(/\.wm-video-source-panel \.panel-heading button\s*\{[\s\S]*?width:\s*100%/);
    expect(css).toMatch(/\.wm-video-source-panel \.panel-heading button\s*\{[\s\S]*?min-width:\s*0/);
    expect(css).toMatch(/\.wm-video-source-panel \.panel-heading button\s*\{[\s\S]*?align-items:\s*center/);
    expect(css).toMatch(/\.wm-video-source-panel \.panel-heading button\s*\{[\s\S]*?justify-content:\s*center/);
  });
});
