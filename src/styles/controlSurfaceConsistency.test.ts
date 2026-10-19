import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const video = readFileSync('src/watermark-workbench/watermarkWorkbench.css', 'utf8');
const gifMedia = readFileSync('src/gif-media/gifMedia.css', 'utf8');
const gifTool = readFileSync('src/gif-tool/gifTool.css', 'utf8');
const watermarkTool = readFileSync('src/watermark-tool/watermarkTool.css', 'utf8');
const components = readFileSync('src/styles/components.css', 'utf8');

describe('cross-tool control surfaces', () => {
  it('aligns every video output control to the compact control height', () => {
    expect(video).toMatch(/\.wm-video-output-actions button[\s\S]*?height: var\(--control-height-compact\);/);
    expect(video).toMatch(/\.wm-export-center-config \.wm-prop-toggle[\s\S]*?height: var\(--control-height-compact\);/);
    expect(video).toContain('align-items: end');
    expect(video).toMatch(/\.wm-video-task-actions button[\s\S]*?padding:0; line-height:0;/);
    expect(video).toMatch(/\.wm-video-output-actions \.wm-icon-button[\s\S]*?place-items: center; align-items:center; justify-items:center;/);
  });

  it('uses the shared upload geometry in token-aware surfaces', () => {
    expect(gifMedia).toContain('min-height: var(--upload-min-height)');
    expect(gifMedia).toContain('border-radius: var(--upload-radius)');
    expect(video).toContain('--slider-track-height');
  });

  it('keeps standalone Vue tools on the same neutral palette and control density', () => {
    expect(gifTool).toContain('--gif-accent: #d9d4ca');
    expect(gifTool).toMatch(/\.gif-settings-input[\s\S]*?height: 36px;/);
    expect(watermarkTool).toContain('--wm-accent: #d9d4ca');
    expect(watermarkTool).toMatch(/\.watermark-tool-form input, \.watermark-tool-form select[\s\S]*?height: 36px;/);
    expect(watermarkTool).toMatch(/\.watermark-tool-dropzone[\s\S]*?border: 1px dashed var\(--wm-border-strong\);[\s\S]*?border-radius: 12px;/);
  });

  it('uses neutral pointer highlights only on interactive surfaces and disables them for reduced motion', () => {
    expect(components).toMatch(/\.pointer-highlight::before[\s\S]*?pointer-events: none/);
    expect(components).toMatch(/\.pointer-highlight:hover::before[\s\S]*?opacity: 1/);
    expect(components).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.pointer-highlight::before \{ display: none; \}/);
  });
});
