import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TOOL_HINTS } from './FocusWorkspace';
import { BrandControlsPanel } from './BrandControlsPanel';
import { DEFAULT_BRAND_LAYER, DEFAULT_BRAND_SETTINGS, createDefaultCprState, createDefaultLogoGroup } from '../../core';
import type { BrandLayerState, BrandSettingsV1, CprState, LogoGroupState } from '../../core';

const noop = vi.fn();

function defaultProps() {
  return {
    logoGroup: createDefaultLogoGroup() as LogoGroupState,
    cprState: createDefaultCprState() as CprState,
    brandLayer: DEFAULT_BRAND_LAYER as BrandLayerState,
    brandSettings: DEFAULT_BRAND_SETTINGS as BrandSettingsV1,
    gameLogoAsset: undefined,
    activeSection: undefined as 'logo' | 'cpr' | undefined,
    onLanguageChange: noop,
    onLogoChange: noop,
    onCprChange: noop,
    onBrandLayerChange: noop,
    onSettingsChange: noop
  };
}

describe('FocusWorkspace tool hints', () => {
  it('shows crop hint for crop tool', () => {
    expect(TOOL_HINTS.crop).toContain('拖动画面移动素材');
    expect(TOOL_HINTS.crop).toContain('滚轮缩放查看');
    expect(TOOL_HINTS.crop).toContain('Space / 中键拖动平移视图');
  });

  it('shows logo hint for logo tool', () => {
    expect(TOOL_HINTS.logo).toContain('拖动 Logo 调整位置');
    expect(TOOL_HINTS.logo).toContain('方向键微调 1px');
    expect(TOOL_HINTS.logo).toContain('Shift + 方向键微调 10px');
  });

  it('shows cpr hint for cpr tool', () => {
    expect(TOOL_HINTS.cpr).toContain('拖动 CPR 调整位置');
    expect(TOOL_HINTS.cpr).toContain('左侧调整大小与颜色');
    expect(TOOL_HINTS.cpr).toContain('Space / 中键拖动平移视图');
  });
});

describe('BrandControlsPanel section structure', () => {
  it('renders Logo and CPR as independent sibling sections', () => {
    const html = renderToStaticMarkup(
      <BrandControlsPanel {...defaultProps()} />
    );
    // Logo section
    expect(html).toContain('aria-labelledby="logo-controls-title"');
    expect(html).toContain('>Logo<');
    // CPR section
    expect(html).toContain('aria-labelledby="cpr-controls-title"');
    expect(html).toContain('>CPR<');
    // Both sections are siblings (not nested): Logo section appears before CPR section
    const logoIdx = html.indexOf('logo-controls-title');
    const cprIdx = html.indexOf('cpr-controls-title');
    expect(logoIdx).toBeGreaterThan(-1);
    expect(cprIdx).toBeGreaterThan(-1);
    expect(cprIdx).toBeGreaterThan(logoIdx);
  });
});

describe('User-visible text unification', () => {
  it('does not contain 品牌 or 品宣 in BrandControlsPanel output', () => {
    const html = renderToStaticMarkup(
      <BrandControlsPanel {...defaultProps()} />
    );
    expect(html).not.toContain('品牌');
    expect(html).not.toContain('品宣');
  });

  it('uses direct names instead of 品牌/品宣 in CprControls description', () => {
    const html = renderToStaticMarkup(
      <BrandControlsPanel {...defaultProps()} />
    );
    expect(html).toContain('固定 SVG 图层');
    expect(html).not.toContain('品牌组件');
  });
});
