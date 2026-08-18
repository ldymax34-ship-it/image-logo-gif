import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/watermark-workbench/watermarkWorkbench.css', 'utf8');

describe('formal watermark page shell style contract', () => {
  it('flattens formal page headers while keeping the workspaces separated below them', () => {
    expect(css).toMatch(/\.wm-image-workspace \.embedded-tool-topbar,[\s\S]*?\.wm-video-workspace \.embedded-tool-topbar\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-bottom:\s*1px solid var\(--color-border\)/);
    expect(css).toContain('.wm-image-workspace > .wm-workspace { flex: 1; height: auto; margin-top: 12px; }');
    expect(css).toContain('.wm-video-workspace > .wm-video-page { padding: 12px 0 0; }');
  });
});
