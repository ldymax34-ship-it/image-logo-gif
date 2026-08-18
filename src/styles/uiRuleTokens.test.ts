import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const components = readFileSync(new URL('./components.css', import.meta.url), 'utf8');

describe('desktop UI rule tokens', () => {
  it('uses one compact typography and control scale', () => {
    expect(tokens).toContain('--font-size-body: 13px');
    expect(tokens).toContain('--font-size-title: 16px');
    expect(tokens).toContain('--control-height: 36px');
    expect(tokens).toContain('--control-height-compact: 32px');
    expect(tokens).toContain('--control-radius: 8px');
    expect(tokens).toContain('--slider-track-height: 8px');
    expect(tokens).toContain('--slider-thumb-size: 20px');
    expect(tokens).toContain('--upload-radius: 12px');
    expect(tokens).toContain('--property-label-width: 52px');
  });

  it('keeps field, canvas, panel and state colors in the theme contract', () => {
    expect(theme).toContain('--color-field:');
    expect(theme).toContain('--color-field-hover:');
    expect(theme).toContain('--color-focus-ring:');
    expect(theme).toContain('--color-danger-border:');
    expect(theme).toContain('--color-warning-border:');
  });

  it('flattens property groups instead of nesting another card', () => {
    expect(components).toMatch(/\.brand-control-group\s*\{[\s\S]*?border-bottom: 1px solid var\(--color-border\);[\s\S]*?background: transparent;/);
    expect(components).toMatch(/\.preset-section\s*\{[\s\S]*?border-bottom: 1px solid var\(--color-border\);[\s\S]*?background: transparent;/);
  });

  it('defines selected, focus, disabled and invalid states without glow', () => {
    expect(components).toMatch(/\.spec-row\.active[\s\S]*?border-color: var\(--color-accent-border\);[\s\S]*?background: var\(--color-accent-soft\);[\s\S]*?color:/);
    expect(components).toContain("input[aria-invalid='true']");
    expect(components).toContain('box-shadow: 0 0 0 var(--focus-ring-width) var(--color-focus-ring-soft)');
    expect(components).toContain('color: var(--color-text-faint);');
    expect(components).not.toMatch(/box-shadow:\s*0\s+0\s+[2-9]\d+px/);
  });

  it('keeps icon buttons at a stable compact hit area', () => {
    expect(components).toMatch(/\.icon-button\s*\{[^}]*min-width: 28px;[^}]*min-height: 28px;/);
  });

  it('defines one native select, range and drop-zone visual contract', () => {
    expect(components).toContain('appearance: none');
    expect(components).toContain("input[type='range']::-webkit-slider-runnable-track");
    expect(components).toContain("input[type='range']::-moz-range-thumb");
    expect(components).toMatch(/\.drop-zone,[\s\S]*?min-height: var\(--upload-min-height\);[\s\S]*?border: 1px dashed var\(--color-border-strong\);[\s\S]*?border-radius: var\(--upload-radius\);/);
  });
});
