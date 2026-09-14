import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildBrandRenderPlan, type BrandEffectState } from '../../core';
import { BrandEffectControls } from '../../components/brand/BrandEffectControls';
import { CustomExportControls, CustomObjectEffectDisclosure, getCenteredCustomLogoOffset, resolveCustomLogoInitialOffset } from './CustomWorkbench';

const effect: BrandEffectState = {
  colorEnabled: true,
  color: '#12abef',
  strokeEnabled: true,
  strokeColor: '#ffffff',
  strokeWidth: 2,
  glowEnabled: false,
  glowColor: '#ffffff',
  glowBlur: 8,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowOpacity: .5,
  shadowBlur: 6,
  shadowOffsetX: 0,
  shadowOffsetY: 2
};

describe('CustomWorkbench visible controls', () => {
  it('centers the first game Logo from the shared Render Plan geometry', () => {
    const canvas = { width: 1920, height: 1080 } as const;
    const logo = { id: 'game', type: 'logo' as const, sourceKind: 'image' as const, name: 'game', language: 'zh-CN' as const, sourceUrl: '/game.png', aspectRatio: 3 };
    const group = { mode: 'game-only' as const, gameLogoLanguage: 'zh-CN' as const, colorMode: 'white' as const, sizePreset: 'standard' as const, scale: 1, companyLogoScale: 'match' as const, gapUnits: .5, placement: 'custom' as const, constraintMode: 'canvas' as const, manualOffset: { x: 0, y: 0 } };
    const offset = getCenteredCustomLogoOffset(canvas, group, logo)!;
    const plan = buildBrandRenderPlan(canvas, { ...group, manualOffset: offset }, { gameLogo: logo });
    expect(plan.logoGroupRect!.x).toBeCloseTo(offset.x);
    expect(plan.logoGroupRect!.y).toBeCloseTo(offset.y);
    expect(offset.x + plan.logoGroupRect!.width / 2).toBeCloseTo(canvas.width / 2);
    expect(offset.y + plan.logoGroupRect!.height / 2).toBeCloseTo(canvas.height / 2);
  });

  it('only applies the computed center while the initial position is still eligible', () => {
    const current = { x: 460, y: 216 };
    const centered = { x: 900, y: 520 };
    expect(resolveCustomLogoInitialOffset(current, centered, true)).toEqual(centered);
    expect(resolveCustomLogoInitialOffset(current, centered, false)).toEqual(current);
    expect(resolveCustomLogoInitialOffset(current, undefined, true)).toEqual(current);
  });

  it('keeps PNG, JPG and the current-board export action in one visible control group', () => {
    const html = renderToStaticMarkup(
      <CustomExportControls format="png" disabled status="未导入图片" onFormatChange={vi.fn()} onExport={vi.fn()} />
    );

    expect(html).toContain('aria-label="导出当前画板"');
    expect(html).toContain('>PNG<');
    expect(html).toContain('>JPG<');
    expect(html).toContain('导出当前画板');
    expect(html).toContain('class="primary-button"');
    expect(html).not.toContain('specular-button');
    expect(html).toContain('disabled=""');
    expect(html).toContain('role="status"');
  });

  it.each(['游戏 Logo', '公司 Logo', 'CPR'])('%s advanced styles have one disclosure owner with the effect summary', (title) => {
    const html = renderToStaticMarkup(<CustomObjectEffectDisclosure title={title} effect={effect} onChange={vi.fn()} />);

    expect((html.match(/<details/g) ?? [])).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*>[\s\S]*<details/);
    expect(html).toContain(`${title} 高级样式`);
    expect(html).toContain('描边开 · 阴影开 · 发光关 · 改色');
    expect(html).toContain(`${title} 描边颜色`);
  });

  it('renders embedded effect controls without a second details element and preserves the controlled effect values', () => {
    const first = renderToStaticMarkup(<BrandEffectControls title="游戏 Logo" effect={effect} onChange={vi.fn()} embedded />);
    const next = renderToStaticMarkup(<BrandEffectControls title="游戏 Logo" effect={{ ...effect, strokeEnabled: false }} onChange={vi.fn()} embedded />);

    expect(first).not.toContain('<details');
    expect(first).toMatch(/<input type="checkbox" checked=""\/>描边/);
    expect(next).toMatch(/<input type="checkbox"\/>描边/);
  });
});
