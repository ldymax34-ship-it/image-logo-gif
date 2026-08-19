import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const components = readFileSync(new URL('../styles/components.css', import.meta.url), 'utf8');

describe('AppSidebar navigation styles', () => {
  it('keeps navigation geometry stable across states', () => {
    expect(components).toMatch(/\.app-sidebar-item\s*\{[\s\S]*?height: 34px;[\s\S]*?min-height: 34px;[\s\S]*?border: 1px solid transparent;[\s\S]*?line-height: 18px;/);
    expect(components).toMatch(/\.app-sidebar-item\.active\s*\{[\s\S]*?border-color: transparent;/);
  });

  it('uses one fixed icon slot and one SVG size for every sidebar item', () => {
    expect(components).toMatch(/\.app-sidebar-icon\s*\{[\s\S]*?width: 18px;[\s\S]*?height: 18px;[\s\S]*?flex: 0 0 18px;/);
    expect(components).toMatch(/\.app-sidebar-icon > svg\s*\{[\s\S]*?display: block;[\s\S]*?width: 18px;[\s\S]*?height: 18px;/);
    expect(components).toMatch(/\.app-sidebar-copy\s*\{[\s\S]*?line-height: 18px;/);
  });
});
