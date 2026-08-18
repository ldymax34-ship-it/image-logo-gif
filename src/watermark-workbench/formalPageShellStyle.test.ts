import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/watermark-workbench/watermarkWorkbench.css', 'utf8');
const imagePage = readFileSync('src/watermark-workbench/WatermarkWorkbench.tsx', 'utf8');
const videoPage = readFileSync('src/watermark-workbench/VideoWatermarkWorkspace.tsx', 'utf8');

describe('formal watermark page shell style contract', () => {
  it('flattens formal page headers while keeping the workspaces separated below them', () => {
    expect(css).toMatch(/\.wm-image-workspace \.embedded-tool-topbar,[\s\S]*?\.wm-video-workspace \.embedded-tool-topbar\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-bottom:\s*1px solid var\(--color-border\)/);
    expect(css).toContain('.wm-image-workspace > .wm-workspace { flex: 1; height: auto; margin-top: 12px; }');
    expect(css).toContain('.wm-video-workspace > .wm-video-page { padding: 12px 0 0; }');
  });

  it('uses the shared Select adapter on both formal watermark pages', () => {
    expect(imagePage).not.toContain('@radix-ui/react-select');
    expect(videoPage).not.toContain('@radix-ui/react-select');
    expect(imagePage).not.toContain('wm-select-');
    expect(videoPage).not.toContain('wm-select-');
    expect(imagePage).toContain('aria-label="排列方式"');
    expect(imagePage).toContain('aria-label="平铺密度"');
    expect(videoPage).toContain('aria-label="视频排列方式"');
    expect(videoPage).toContain('aria-label="视频平铺密度"');
    expect(videoPage).toContain('aria-label="视频质量预设"');
    expect(css).not.toContain('.wm-select-');
  });

  it('keeps watermark tabs readable with neutral active and hover states', () => {
    expect(css).toMatch(/\.wm-tabs-trigger:hover:not\(:disabled\)[^{]*\{[^}]*color: var\(--color-text\)/);
    expect(css).toMatch(/\.wm-tabs-trigger\[data-state="active"\][^{]*\{[^}]*color: var\(--color-text\)/);
    expect(css).not.toMatch(/\.wm-tabs-trigger\[data-state="active"\][^{]*\{[^}]*var\(--color-(accent|primary-contrast)\)/);
  });
});
