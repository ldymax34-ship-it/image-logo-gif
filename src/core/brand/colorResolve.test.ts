import { describe, expect, it } from 'vitest';
import {
  resolveColorEffect,
  deriveBrandColorMode,
  deriveCprColorMode,
  buildBrandRenderPlan,
  buildBoardRenderPlan,
  createDefaultLogoGroup,
  createDefaultCprState,
  resolveCprState,
  DEFAULT_BRAND_LAYER,
  DEFAULT_BRAND_EFFECT,
  DEFAULT_LOGO_EFFECT,
  type BrandEffectState,
  type BrandColorMode,
  type LogoGroupState,
  type CprState,
  type BrandLayerState
} from '../index';

const CANVAS = { width: 1920, height: 1080 };

function logoAsset() {
  return { id: 'logo1', type: 'logo' as const, sourceKind: 'image' as const, name: 'test-logo', language: 'zh-CN' as const, sourceUrl: '/logo.png', viewBoxSize: { width: 400, height: 120 }, aspectRatio: 400 / 120 };
}

describe('resolveColorEffect', () => {
  it('original: colorEnabled=false, preserves effect', () => {
    const effect = { ...DEFAULT_LOGO_EFFECT, color: '#12abef' };
    const result = resolveColorEffect('original', effect);
    expect(result.colorEnabled).toBe(false);
    expect(result.color).toBe('#12abef');
  });

  it('white: colorEnabled=true, color=#ffffff', () => {
    const result = resolveColorEffect('white', DEFAULT_LOGO_EFFECT);
    expect(result.colorEnabled).toBe(true);
    expect(result.color).toBe('#ffffff');
  });

  it('black: colorEnabled=true, color=#000000', () => {
    const result = resolveColorEffect('black', DEFAULT_LOGO_EFFECT);
    expect(result.colorEnabled).toBe(true);
    expect(result.color).toBe('#000000');
  });

  it('custom: colorEnabled=true, preserves effect.color (#12abef)', () => {
    const effect = { ...DEFAULT_LOGO_EFFECT, color: '#12abef' };
    const result = resolveColorEffect('custom', effect);
    expect(result.colorEnabled).toBe(true);
    expect(result.color).toBe('#12abef');
  });
});

describe('deriveCprColorMode migration', () => {
  it('derives a color mode from a missing or invalid runtime value through the effect', () => {
    expect(deriveBrandColorMode({ ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#12abef' })).toBe('custom');
    expect(resolveColorEffect(undefined, { ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#000000' })).toMatchObject({ colorEnabled: true, color: '#000000' });
  });

  it('returns original when colorEnabled=false', () => {
    expect(deriveCprColorMode({ ...DEFAULT_LOGO_EFFECT, colorEnabled: false })).toBe('original');
  });

  it('returns black for #000000', () => {
    expect(deriveCprColorMode({ ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#000000' })).toBe('black');
  });

  it('returns white for #ffffff', () => {
    expect(deriveCprColorMode({ ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#ffffff' })).toBe('white');
  });

  it('returns custom for non-white/black color (#12abef)', () => {
    expect(deriveCprColorMode({ ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#12abef' })).toBe('custom');
  });

  it('returns custom for uppercase non-standard color', () => {
    expect(deriveCprColorMode({ ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#FF00AA' })).toBe('custom');
  });
});

describe('buildBrandRenderPlan color resolution', () => {
  function buildGroup(colorMode: BrandColorMode): LogoGroupState {
    return { ...createDefaultLogoGroup(), colorMode, placement: 'corner-right' as const };
  }

  it('derives Logo custom color from a legacy JSON group missing colorMode', () => {
    const legacyGroup = JSON.parse(JSON.stringify(createDefaultLogoGroup())) as Record<string, unknown>;
    delete legacyGroup.colorMode;
    const plan = buildBrandRenderPlan(
      CANVAS,
      legacyGroup as unknown as LogoGroupState,
      { gameLogo: logoAsset(), effect: { ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#12abef' } }
    );
    expect(plan.logoItems[0].effect).toMatchObject({ colorEnabled: true, color: '#12abef' });
  });

  it('Logo original: effect.colorEnabled=false in render plan', () => {
    const group = buildGroup('original');
    const plan = buildBrandRenderPlan(CANVAS, group, { gameLogo: logoAsset() });
    expect(plan.logoItems).toHaveLength(1);
    expect(plan.logoItems[0].effect.colorEnabled).toBe(false);
  });

  it('Logo white: effect.colorEnabled=true, color=#ffffff', () => {
    const group = buildGroup('white');
    const plan = buildBrandRenderPlan(CANVAS, group, { gameLogo: logoAsset() });
    expect(plan.logoItems[0].effect.colorEnabled).toBe(true);
    expect(plan.logoItems[0].effect.color).toBe('#ffffff');
  });

  it('Logo black: effect.colorEnabled=true, color=#000000', () => {
    const group = buildGroup('black');
    const plan = buildBrandRenderPlan(CANVAS, group, { gameLogo: logoAsset() });
    expect(plan.logoItems[0].effect.colorEnabled).toBe(true);
    expect(plan.logoItems[0].effect.color).toBe('#000000');
  });

  it('Logo custom: preserves effect.color (#12abef)', () => {
    const group = buildGroup('custom');
    const customEffect: BrandEffectState = { ...DEFAULT_LOGO_EFFECT, color: '#12abef' };
    const plan = buildBrandRenderPlan(CANVAS, group, { gameLogo: logoAsset(), effect: customEffect });
    expect(plan.logoItems[0].effect.colorEnabled).toBe(true);
    expect(plan.logoItems[0].effect.color).toBe('#12abef');
  });

  it('CPR original: effect.colorEnabled=false', () => {
    const cpr: CprState = { ...createDefaultCprState(), colorMode: 'original' };
    const plan = buildBrandRenderPlan(CANVAS, createDefaultLogoGroup(), { cpr });
    expect(plan.cpr).toBeDefined();
    expect(plan.cpr!.effect.colorEnabled).toBe(false);
  });

  it('CPR white: effect.colorEnabled=true, color=#ffffff', () => {
    const cpr: CprState = { ...createDefaultCprState(), colorMode: 'white' };
    const plan = buildBrandRenderPlan(CANVAS, createDefaultLogoGroup(), { cpr });
    expect(plan.cpr!.effect.colorEnabled).toBe(true);
    expect(plan.cpr!.effect.color).toBe('#ffffff');
  });

  it('CPR black: effect.colorEnabled=true, color=#000000', () => {
    const cpr: CprState = { ...createDefaultCprState(), colorMode: 'black' };
    const plan = buildBrandRenderPlan(CANVAS, createDefaultLogoGroup(), { cpr });
    expect(plan.cpr!.effect.colorEnabled).toBe(true);
    expect(plan.cpr!.effect.color).toBe('#000000');
  });

  it('CPR custom: preserves effect.color (#12abef)', () => {
    const cpr: CprState = {
      ...createDefaultCprState(),
      colorMode: 'custom',
      effect: { ...DEFAULT_BRAND_EFFECT, color: '#12abef' }
    };
    const plan = buildBrandRenderPlan(CANVAS, createDefaultLogoGroup(), { cpr });
    expect(plan.cpr!.effect.colorEnabled).toBe(true);
    expect(plan.cpr!.effect.color).toBe('#12abef');
  });

  it('derives CPR custom color from a legacy JSON state missing colorMode', () => {
    const legacyCprState = JSON.parse(JSON.stringify({
      ...createDefaultCprState(),
      effect: { ...DEFAULT_BRAND_EFFECT, colorEnabled: true, color: '#12abef' }
    })) as Record<string, unknown>;
    delete legacyCprState.colorMode;
    const legacyLayer = JSON.parse(JSON.stringify({
      ...DEFAULT_BRAND_LAYER,
      cprState: legacyCprState
    })) as BrandLayerState;
    const cpr = resolveCprState(legacyLayer);
    const plan = buildBrandRenderPlan(CANVAS, createDefaultLogoGroup(), { cpr });
    expect(cpr.colorMode).toBe('custom');
    expect(plan.cpr!.effect).toMatchObject({ colorEnabled: true, color: '#12abef' });
  });
});

describe('buildBoardRenderPlan consistency', () => {
  function makeAsset() {
    return {
      id: 'asset1',
      fileName: 'test.jpg',
      objectUrl: 'blob:test',
      naturalWidth: 1920,
      naturalHeight: 1080,
      width: 1920,
      height: 1080
    } as any;
  }
  function makeSpec() {
    return { id: 'spec1', name: '1920x1080', width: 1920, height: 1080, format: 'jpg' as const, maxSizeKb: 2048 };
  }
  function makePreviewState() {
    return { assetId: 'asset1', specId: 'spec1', fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } };
  }

  it('Logo layer.effect matches buildBrandRenderPlan item.effect (no double override)', () => {
    const logoGroup = { ...createDefaultLogoGroup(), colorMode: 'custom' as const, placement: 'corner-right' as const };
    const logoEffect: BrandEffectState = { ...DEFAULT_LOGO_EFFECT, color: '#12abef' };
    const brandLayer: BrandLayerState = {
      logoEnabled: true,
      cprEnabled: false,
      logoLanguage: 'zh-CN',
      cprLanguage: 'zh-CN',
      logoAnchor: 'top-right',
      cprAnchor: 'top-right',
      logoSize: 'standard',
      cprSize: 'standard',
      logoEffect,
      cprEffect: DEFAULT_BRAND_EFFECT,
      logoGroup
    };
    const plan = buildBoardRenderPlan({
      asset: makeAsset(),
      spec: makeSpec(),
      previewState: makePreviewState(),
      brandLayer,
      gameLogoAsset: logoAsset()
    });
    const logoLayer = plan.layers.find((l) => l.type === 'logo');
    expect(logoLayer).toBeDefined();
    expect(logoLayer!.effect.colorEnabled).toBe(true);
    expect(logoLayer!.effect.color).toBe('#12abef');
  });

  it('CPR layer.effect uses resolved color from buildBrandRenderPlan', () => {
    const cprEffect: BrandEffectState = { ...DEFAULT_BRAND_EFFECT, color: '#ff00aa' };
    const cprState: CprState = {
      ...createDefaultCprState(),
      colorMode: 'custom',
      effect: cprEffect
    };
    const brandLayer: BrandLayerState = {
      logoEnabled: false,
      cprEnabled: true,
      logoLanguage: 'zh-CN',
      cprLanguage: 'zh-CN',
      logoAnchor: 'top-right',
      cprAnchor: 'top-right',
      logoSize: 'standard',
      cprSize: 'standard',
      logoEffect: DEFAULT_LOGO_EFFECT,
      cprEffect,
      cprState
    };
    const cprAsset = { id: 'cpr1', type: 'cpr' as const, sourceKind: 'svg' as const, name: 'cpr.svg', language: 'custom' as const, viewBoxSize: { width: 1669, height: 109 }, aspectRatio: 1669 / 109 };
    const plan = buildBoardRenderPlan({
      asset: makeAsset(),
      spec: makeSpec(),
      previewState: makePreviewState(),
      brandLayer,
      cprAsset
    });
    const cprLayer = plan.layers.find((l) => l.type === 'cpr');
    expect(cprLayer).toBeDefined();
    expect(cprLayer!.effect.colorEnabled).toBe(true);
    expect(cprLayer!.effect.color).toBe('#ff00aa');
  });
});
