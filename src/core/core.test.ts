import { describe, expect, it } from 'vitest';
import {
  buildOutputFileName,
  buildBoardRenderPlan,
  createBatchExportItems,
  classifyAspect,
  computeCprLayout,
  computeFitRect,
  computeLogoLayout,
  DEFAULT_BRAND_ASSETS,
  DEFAULT_LOGO_EFFECT,
  createBrandAsset,
  createRasterBrandAsset,
  estimateExportBytes,
  formatMegabytes,
  createInitialCropState,
  getBoardPreviewKey,
  parseSpecText,
  panCropState,
  renderBrandLayer,
  sanitizeFileNamePart,
  serializePresetSpecs,
  toPresetSpecs,
  zoomCropState
  , buildBrandRenderPlan, createBrandGrid, CPR_PRESET, createDefaultLogoGroup, DEFAULT_BRAND_EFFECT, DEFAULT_BRAND_SETTINGS, DEFAULT_CPR_STATE, createDefaultCprState, snapLogoGroupPosition, DEFAULT_MAX_SIZE_KB, exportJpegWithinLimit, getEffectiveMaxSizeKb, isOverSizeLimit, PRESET_TEMPLATES, createLanguageBatchExportItems, computeCprPlacementRect, EXPORT_LANGUAGES, migrateBoardBrandStates
} from './index';

describe('core 0.1.x foundation', () => {
  it('parses size fragments and keeps unrecognized lines', () => {
    const result = parseSpecText('1080x1920\n16:9 1920\nbad line');
    expect(result.specs.map((spec) => `${spec.width}x${spec.height}`)).toEqual(['1080x1920', '1920x1080']);
    expect(result.unrecognizedLines).toHaveLength(1);
  });

  it('keeps stable spec ids when unrelated lines are inserted above', () => {
    const base = parseSpecText('1080x1920\n1920x1080');
    const shifted = parseSpecText('说明文字\n1080x1920\n1920x1080');
    expect(shifted.specs.map((spec) => spec.id)).toEqual(base.specs.map((spec) => spec.id));
  });

  it('keeps stable spec ids when only labels change', () => {
    const base = parseSpecText('微博竖图 1080x1920');
    const renamed = parseSpecText('小红书竖图 1080x1920');
    expect(renamed.specs[0]?.id).toBe(base.specs[0]?.id);
  });

  it('keeps duplicated specs uniquely addressable', () => {
    const result = parseSpecText('1080x1920\n1080x1920');
    expect(result.specs).toHaveLength(2);
    expect(new Set(result.specs.map((spec) => spec.id)).size).toBe(2);
  });

  it('parses multiplication signs and comma-like mixed separators', () => {
    const result = parseSpecText('3840×2160、900 383，1920*1080');
    expect(result.specs.map((spec) => `${spec.width}x${spec.height}`)).toEqual(['3840x2160', '900x383', '1920x1080']);
  });

  it('parses table-like pasted rows with format and size limit', () => {
    const result = parseSpecText('banner\t1920\t1080\tpng\t2MB');
    expect(result.specs).toHaveLength(1);
    expect(result.specs[0]).toMatchObject({ width: 1920, height: 1080, format: 'png', maxSizeKb: 2048 });
  });

  it('defaults format to jpg and supports kb limits', () => {
    const result = parseSpecText('feed 1080x1080 800KB');
    expect(result.specs[0]).toMatchObject({ format: 'jpg', maxSizeKb: 800 });
  });

  it('does not duplicate a preset row when its label repeats the same dimensions', () => {
    const result = parseSpecText('竖版_1080x1920 1080x1920 jpg 1.2MB');
    expect(result.specs).toHaveLength(1);
    expect(result.specs[0]).toMatchObject({ name: '竖版', width: 1080, height: 1920, maxSizeKb: 1229 });
  });

  it('keeps invalid small dimensions out of parsed specs', () => {
    const result = parseSpecText('8x9\n200x100');
    expect(result.specs.map((spec) => `${spec.width}x${spec.height}`)).toEqual(['200x100']);
    expect(result.unrecognizedLines).toHaveLength(1);
  });

  it('classifies aspect families', () => {
    expect(classifyAspect({ width: 1920, height: 1080 })).toBe('landscape');
    expect(classifyAspect({ width: 1080, height: 1080 })).toBe('square');
    expect(classifyAspect({ width: 1080, height: 1920 })).toBe('portrait');
  });

  it('builds the 32-column brand grid from the canvas width', () => {
    const grid = createBrandGrid({ width: 1920, height: 1080 });
    expect(grid).toMatchObject({ columns: 32, unit: 60, halfUnit: 30, rows: 18 });
  });

  it('keeps the reference grid scale across aspect ratios', () => {
    expect(createBrandGrid({ width: 3840, height: 2160 })).toMatchObject({ columns: 32, unit: 120, rows: 18 });
    expect(createBrandGrid({ width: 800, height: 600 })).toMatchObject({ columns: 24, unit: 600 / 18, rows: 18 });
    expect(createBrandGrid({ width: 1080, height: 1920 })).toMatchObject({ columns: 18, unit: 60, rows: 32 });
    expect(createBrandGrid({ width: 1080, height: 1080 })).toMatchObject({ columns: 18, unit: 60, rows: 18 });
  });

  it('keeps the standard corner Logo size consistent for equal short sides', () => {
    const gameLogo = createRasterBrandAsset({ id: 'grid-logo', type: 'logo', name: 'Logo', language: 'zh-CN', sourceUrl: '/logo.png', width: 3, height: 1 });
    const group = createDefaultLogoGroup('zh-CN');
    const landscape = buildBrandRenderPlan({ width: 1920, height: 1080 }, group, { gameLogo });
    const portrait = buildBrandRenderPlan({ width: 1080, height: 1920 }, group, { gameLogo });
    const square = buildBrandRenderPlan({ width: 1080, height: 1080 }, group, { gameLogo });
    expect(landscape.logoGroupRect?.width).toBe(120);
    expect(portrait.logoGroupRect?.width).toBe(120);
    expect(square.logoGroupRect?.width).toBe(120);
  });

  it('applies a small visual-size correction to the English game Logo', () => {
    const englishLogo = createRasterBrandAsset({ id: 'english-grid-logo', type: 'logo', name: 'English Logo', language: 'en-US', sourceUrl: '/english-logo.png', width: 4, height: 1 });
    const group = createDefaultLogoGroup('en-US');
    const landscape = buildBrandRenderPlan({ width: 1920, height: 1080 }, group, { gameLogo: englishLogo });
    const portrait = buildBrandRenderPlan({ width: 1080, height: 1920 }, group, { gameLogo: englishLogo });
    expect(landscape.logoGroupRect?.width).toBeCloseTo(132);
    expect(portrait.logoGroupRect?.width).toBeCloseTo(138);
  });

  it('ships CPR as a fixed SVG preset and defaults all effects off', () => {
    expect(CPR_PRESET.sourceUrl).toBe('/brand-cpr/kuro-rights.svg');
    expect(CPR_PRESET.viewBox).toEqual({ width: 16.69, height: 1.09 });
    expect(DEFAULT_BRAND_EFFECT.strokeEnabled).toBe(false);
    expect(DEFAULT_BRAND_EFFECT.glowEnabled).toBe(false);
    expect(DEFAULT_BRAND_EFFECT.shadowEnabled).toBe(false);
  });

  it('defaults fixed CPR to the bottom-right brand position', () => {
    expect(DEFAULT_BRAND_SETTINGS.defaultCprPlacement).toBe('bottom-right');
    expect(DEFAULT_CPR_STATE.transform.placement).toBe('bottom-right');
    expect(createDefaultCprState().transform.placement).toBe('bottom-right');
  });

  it('builds a grouped logo render plan with CPR fixed to the bottom', () => {
    const group = { ...createDefaultLogoGroup('zh-CN'), mode: 'company-and-game' as const, placement: 'corner-left' as const };
    const plan = buildBrandRenderPlan({ width: 1920, height: 1080 }, group, {
      companyLogo: createRasterBrandAsset({ id: 'company', type: 'logo', name: 'Company', language: 'custom', sourceUrl: '/company.png', width: 4, height: 1 }),
      gameLogo: createRasterBrandAsset({ id: 'game', type: 'logo', name: 'Game', language: 'zh-CN', sourceUrl: '/game.png', width: 3, height: 1 }),
      cpr: { ...DEFAULT_CPR_STATE, enabled: true, transform: { placement: 'bottom-left', offsetX: 0, offsetY: 0 } }
    });
    expect(plan.logoItems).toHaveLength(2);
    expect((plan.cpr?.rect.y ?? 0) + (plan.cpr?.rect.height ?? 0)).toBe(1050);
    expect(plan.cpr?.rect.x).toBe(30);
  });

  it('applies the company visual hierarchy in company-only mode', () => {
    const company = createRasterBrandAsset({ id: 'company-only', type: 'logo', name: 'Company', language: 'custom', sourceUrl: '/company.png', width: 4, height: 1 });
    const group = { ...createDefaultLogoGroup('zh-CN'), mode: 'company-only' as const };
    const small = buildBrandRenderPlan({ width: 1920, height: 1080 }, { ...group, companyLogoScale: 'small' }, { companyLogo: company });
    const match = buildBrandRenderPlan({ width: 1920, height: 1080 }, { ...group, companyLogoScale: 'match' }, { companyLogo: company });
    const large = buildBrandRenderPlan({ width: 1920, height: 1080 }, { ...group, companyLogoScale: 'large' }, { companyLogo: company });
    expect(small.logoGroupRect?.width).toBeLessThan(match.logoGroupRect?.width ?? 0);
    expect(match.logoGroupRect?.width).toBeLessThan(large.logoGroupRect?.width ?? 0);
  });

  it('uses one continuous formula for logo scale across preset boundaries', () => {
    const game = createRasterBrandAsset({ id: 'continuous-scale', type: 'logo', name: 'Game', language: 'zh-CN', sourceUrl: '/game.png', width: 3, height: 1 });
    const base = { ...createDefaultLogoGroup('zh-CN'), sizePreset: 'standard' as const };
    const before = buildBrandRenderPlan({ width: 1920, height: 1080 }, { ...base, scale: 1.2 }, { gameLogo: game });
    const after = buildBrandRenderPlan({ width: 1920, height: 1080 }, { ...base, scale: 1.21 }, { gameLogo: game });
    expect((after.logoGroupRect?.width ?? 0) - (before.logoGroupRect?.width ?? 0)).toBeCloseTo(1.2);
  });

  it('keeps a custom CPR position inside the board bounds', () => {
    const rect = computeCprPlacementRect({ width: 1920, height: 1080 }, { placement: 'custom', offsetX: 1800, offsetY: 1060 });
    expect(rect.x + rect.width).toBeLessThanOrEqual(1905);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1065);
  });

  it('applies CPR offsets relative to the recommended placement and keeps a 0.25U safety margin', () => {
    const base = computeCprPlacementRect({ width: 1920, height: 1080 }, { placement: 'bottom-right', offsetX: 0, offsetY: 0 });
    const moved = computeCprPlacementRect({ width: 1920, height: 1080 }, { placement: 'bottom-right', offsetX: -12, offsetY: -18 });
    expect(moved.x).toBe(base.x - 12);
    expect(moved.y).toBe(base.y - 18);
    const clamped = computeCprPlacementRect({ width: 1920, height: 1080 }, { placement: 'bottom-right', offsetX: 9999, offsetY: 9999 });
    expect(clamped.x + clamped.width).toBe(1905);
    expect(clamped.y + clamped.height).toBe(1065);
  });

  it('expands a batch export matrix with every selected language', () => {
    const asset = { id: 'a', fileName: 'a.png', objectUrl: 'blob:a', width: 100, height: 100, fileSize: 100, mimeType: 'image/png' };
    const spec = { id: 's', name: 'square', width: 100, height: 100, format: 'png' as const };
    const items = createLanguageBatchExportItems([asset], [spec], ['zh-CN', 'en-US']);
    expect(items).toEqual([{ id: 'a:s:zh-CN', assetId: 'a', specId: 's', language: 'zh-CN' }, { id: 'a:s:en-US', assetId: 'a', specId: 's', language: 'en-US' }]);
  });

  it('always uses the fixed five-language export set', () => {
    const asset = { id: 'a', fileName: 'a.png', objectUrl: 'blob:a', width: 100, height: 100, fileSize: 100, mimeType: 'image/png' };
    const spec = { id: 's', name: 'square', width: 100, height: 100, format: 'png' as const };
    expect(createLanguageBatchExportItems([asset], [spec])).toHaveLength(EXPORT_LANGUAGES.length);
  });

  it('migrates split brand maps into independent board brand states', () => {
    const logo = createDefaultLogoGroup('zh-CN');
    const states = migrateBoardBrandStates({
      boardKeys: ['asset-a:spec-1', 'asset-b:spec-1'],
      legacyLogoGroups: { 'asset-a:spec-1': { ...logo, placement: 'corner-left' } },
      legacyCprStates: { 'asset-a:spec-1': { ...DEFAULT_CPR_STATE, transform: { placement: 'bottom-left', offsetX: 8, offsetY: 2 } } },
      defaults: { logo, cpr: DEFAULT_CPR_STATE }
    });
    expect(states['asset-a:spec-1'].logo.placement).toBe('corner-left');
    expect(states['asset-a:spec-1'].cpr.transform).toMatchObject({ placement: 'bottom-left', offsetX: 8 });
    expect(states['asset-b:spec-1']).not.toBe(states['asset-a:spec-1']);
  });

  it('keeps CPR independent from a custom logo position', () => {
    const group = {
      ...createDefaultLogoGroup('zh-CN'),
      placement: 'custom' as const,
      lastExplicitPlacement: 'corner-left' as const,
      manualOffset: { x: 640, y: 240 }
    };
    const plan = buildBrandRenderPlan({ width: 1920, height: 1080 }, group, {
      gameLogo: createRasterBrandAsset({ id: 'game', type: 'logo', name: 'Game', language: 'zh-CN', sourceUrl: '/game.png', width: 3, height: 1 }),
      cpr: { ...DEFAULT_CPR_STATE, enabled: true, transform: { placement: 'bottom-right', offsetX: 0, offsetY: 0 } }
    });
    expect(plan.logoGroupRect?.x).toBe(640);
    expect((plan.cpr?.rect.x ?? 0) + (plan.cpr?.rect.width ?? 0)).toBe(1890);
  });

  it('supports all fixed CPR positions and independent effects', () => {
    const group = createDefaultLogoGroup('zh-CN');
    const gameLogo = createRasterBrandAsset({ id: 'game', type: 'logo', name: 'Game', language: 'zh-CN', sourceUrl: '/game.png', width: 3, height: 1 });
    const plans = (['bottom-left', 'bottom-center', 'bottom-right'] as const).map((placement) => buildBrandRenderPlan(
      { width: 1920, height: 1080 },
      group,
      { gameLogo, cpr: { ...DEFAULT_CPR_STATE, enabled: true, transform: { placement, offsetX: 0, offsetY: 0 }, colorMode: 'black', effect: { ...DEFAULT_CPR_STATE.effect, shadowEnabled: true } } }
    ));
    expect(plans.map((plan) => plan.cpr?.rect.x)).toEqual([30, 795, 1560]);
    expect(plans[0].cpr?.effect).toMatchObject({ colorEnabled: true, color: '#000000', shadowEnabled: true });
    expect(DEFAULT_CPR_STATE.effect).toMatchObject({ strokeEnabled: false, glowEnabled: false, shadowEnabled: false });
  });

  it('snaps a dragged logo group to brand anchors in canvas coordinates', () => {
    const snapped = snapLogoGroupPosition(
      { width: 1920, height: 1080 },
      { width: 240, height: 80 },
      { x: 1665, y: 64 },
      10
    );
    expect(snapped.x).toBe(1620);
    expect(snapped.y).toBe(60);
    expect(snapped.snappedX).toBe('right');
    expect(snapped.snappedY).toBe('top');
  });

  it('uses one brand layer calculation for logo and cpr', () => {
    const result = renderBrandLayer({
      canvas: { width: 1080, height: 1920 },
      includeLogo: true,
      includeCpr: true,
      logoAsset: { id: 'l', kind: 'logo', label: 'Logo', aspectRatio: 3.5 },
      cprAsset: { id: 'c', kind: 'cpr', label: 'CPR', aspectRatio: 5.2 }
    });
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].layout.rect.width).toBeGreaterThan(0);
    expect(result.layers[1].layout.rect.height).toBeGreaterThan(0);
  });

  it('keeps logo and cpr inside the canvas', () => {
    const canvas = { width: 300, height: 160 };
    const logo = computeLogoLayout({ canvas, anchor: 'top-right', svgAspectRatio: 4 });
    const cpr = computeCprLayout({ canvas, anchor: 'center', svgAspectRatio: 5 });
    for (const rect of [logo.rect, cpr.rect]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(canvas.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(canvas.height);
    }
  });

  it('uses CPR anchor as a bottom alignment semantic only', () => {
    const canvas = { width: 1920, height: 1080 };
    const left = computeCprLayout({ canvas, anchor: 'top-left', svgAspectRatio: 16.69 / 1.09 });
    const center = computeCprLayout({ canvas, anchor: 'center', svgAspectRatio: 16.69 / 1.09 });
    const right = computeCprLayout({ canvas, anchor: 'top-right', svgAspectRatio: 16.69 / 1.09 });
    expect(left.rect.x).toBe(left.marginPx);
    expect(right.rect.x + right.rect.width).toBe(canvas.width - right.marginPx);
    expect(center.rect.x + center.rect.width / 2).toBeCloseTo(canvas.width / 2);
    for (const result of [left, center, right]) expect(result.rect.y + result.rect.height).toBe(canvas.height - result.marginPx);
  });

  it('scales landscape logo consistently by short side clamp', () => {
    const wide = computeLogoLayout({ canvas: { width: 2560, height: 1097 }, svgAspectRatio: 3 });
    const sixteenNine = computeLogoLayout({ canvas: { width: 1920, height: 1080 }, svgAspectRatio: 3 });
    expect(Math.abs(wide.widthPx - sixteenNine.widthPx)).toBeLessThanOrEqual(4);
  });

  it('sanitizes output file names for cross-platform use', () => {
    const fileName = buildOutputFileName(
      { id: '1', name: 'CON/测试', width: 900, height: 383, format: 'jpg' },
      { batchName: '批次:A', index: 0 }
    );
    expect(fileName).toBe('01_批次_A_CON_测试_900x383.jpg');
  });

  it('removes path traversal and windows-illegal filename characters', () => {
    expect(sanitizeFileNamePart('../a:b*c?d"e<f>g|')).toBe('_a_b_c_d_e_f_g_');
  });

  it('prefixes reserved windows names after normalization', () => {
    expect(sanitizeFileNamePart('nul')).toBe('_nul');
  });

  it('computes cover and contain image fit without distortion', () => {
    const cover = computeFitRect({ width: 1000, height: 500 }, { width: 300, height: 300 }, 'cover');
    const contain = computeFitRect({ width: 1000, height: 500 }, { width: 300, height: 300 }, 'contain');
    expect(cover.width).toBe(600);
    expect(cover.height).toBe(300);
    expect(cover.x).toBe(-150);
    expect(contain.width).toBe(300);
    expect(contain.height).toBe(150);
    expect(contain.y).toBe(75);
  });

  it('keeps crop state reusable by asset and board key', () => {
    expect(getBoardPreviewKey('asset_a', 'spec_b')).toBe('asset_a:spec_b');
    const crop = createInitialCropState({ width: 1000, height: 500 }, { width: 300, height: 300 }, 'cover');
    expect(crop.scale).toBe(0.6);
    const panned = panCropState({ width: 1000, height: 500 }, { width: 300, height: 300 }, crop, 40, 0, 'cover');
    expect(panned.offsetX).toBeGreaterThan(crop.offsetX);
    const zoomed = zoomCropState({ width: 1000, height: 500 }, { width: 300, height: 300 }, crop, 1.2, { x: 150, y: 150 });
    expect(zoomed.scale).toBe(1.2);
    expect(zoomed.offsetX).toBeLessThan(crop.offsetX);
  });

  it('creates SVG brand assets with language and viewBox metadata', () => {
    const asset = createBrandAsset({
      id: 'logo_1',
      type: 'logo',
      name: 'logo.svg',
      language: 'zh-CN',
      svgText: '<svg viewBox="0 0 420 120" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>'
    });
    expect(asset.viewBox).toBe('0 0 420 120');
    expect(asset.viewBoxSize).toEqual({ width: 420, height: 120 });
    expect(asset.aspectRatio).toBe(3.5);
  });

  it('ships default raster logo assets from local preset folders', () => {
    expect(DEFAULT_BRAND_ASSETS.length).toBeGreaterThanOrEqual(7);
    expect(DEFAULT_BRAND_ASSETS.every((asset) => asset.sourceKind === 'image')).toBe(true);
    expect(DEFAULT_BRAND_ASSETS.map((asset) => asset.sourceUrl)).toContain('/brand-logos/company/kuro-en-white.png');
    expect(DEFAULT_BRAND_ASSETS.map((asset) => asset.sourceUrl)).toContain('/brand-logos/wuthering-waves/ww-zh-cn.png');
    expect(DEFAULT_BRAND_ASSETS.some((asset) => asset.language === 'ja-JP')).toBe(true);
    expect(DEFAULT_BRAND_ASSETS.every((asset) => asset.aspectRatio && asset.aspectRatio > 0)).toBe(true);
  });

  it('serializes preset specs back into editable text', () => {
    const text = serializePresetSpecs([
      { name: '微博横版', width: 1200, height: 675, format: 'jpg', maxSizeKb: 800 }
    ]);
    expect(text).toContain('微博横版 1200x675 jpg 800KB');
  });

  it('converts material specs into preset-safe specs', () => {
    const presetSpecs = toPresetSpecs([{ id: 'spec_1', name: 'A', width: 1080, height: 1920, format: 'jpg' }]);
    expect(presetSpecs).toEqual([{ name: 'A', width: 1080, height: 1920, format: 'jpg' }]);
  });

  it('builds one render plan for preview and export use', () => {
    const plan = buildBoardRenderPlan({
      asset: {
        id: 'asset_1',
        fileName: 'hero.png',
        objectUrl: 'blob:hero',
        width: 1000,
        height: 500,
        fileSize: 1,
        mimeType: 'image/png'
      },
      spec: { id: 'spec_1', name: 'kv', width: 300, height: 300, format: 'png' },
      previewState: {
        assetId: 'asset_1',
        specId: 'spec_1',
        crop: { scale: 0.6, offsetX: -150, offsetY: 0 },
        fitMode: 'cover'
      },
      brandLayer: {
        logoEnabled: true,
        cprEnabled: false,
        logoLanguage: 'en-US',
        cprLanguage: 'zh-CN',
        selectedLogoId: 'logo',
        selectedCprId: undefined,
        logoAnchor: 'top-right',
        cprAnchor: 'center',
        logoSize: 'standard',
        cprSize: 'standard',
        logoEffect: DEFAULT_LOGO_EFFECT,
        cprEffect: DEFAULT_LOGO_EFFECT
      },
      logoAsset: createRasterBrandAsset({
        id: 'logo',
        type: 'logo',
        name: 'Logo',
        language: 'en-US',
        sourceUrl: '/logo.png',
        width: 1200,
        height: 300
      })
    });
    expect(plan.canvas).toEqual({ width: 300, height: 300 });
    expect(plan.image.rect.width).toBe(600);
    expect(plan.layers).toHaveLength(1);
  });

  it('renders the fixed CPR SVG at the bottom when a logo group is active', () => {
    const asset = createRasterBrandAsset({ id: 'asset', type: 'logo', name: 'asset', language: 'zh-CN', sourceUrl: '/asset.png', width: 3, height: 1 });
    const cpr = DEFAULT_BRAND_ASSETS.find((candidate) => candidate.id === CPR_PRESET.assetId)!;
    const plan = buildBoardRenderPlan({
      asset: { id: 'image', fileName: 'hero.png', objectUrl: 'blob:hero', width: 1920, height: 1080, fileSize: 1, mimeType: 'image/png' },
      spec: { id: 'board', name: 'board', width: 1920, height: 1080, format: 'png' },
      previewState: { assetId: 'image', specId: 'board', fitMode: 'cover', crop: createInitialCropState({ width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 'cover') },
      brandLayer: { logoEnabled: true, cprEnabled: true, logoLanguage: 'zh-CN', cprLanguage: 'custom', logoAnchor: 'top-right', cprAnchor: 'top-right', logoSize: 'standard', cprSize: 'large', logoEffect: DEFAULT_LOGO_EFFECT, cprEffect: { ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#ffffff' }, logoGroup: { ...createDefaultLogoGroup('zh-CN'), placement: 'corner-right' } },
      logoAsset: asset,
      gameLogoAsset: asset,
      cprAsset: cpr
    });
    const cprLayer = plan.layers.find((layer) => layer.type === 'cpr');
    expect(cprLayer?.asset.id).toBe(CPR_PRESET.assetId);
    expect((cprLayer?.rect.y ?? 0) + (cprLayer?.rect.height ?? 0)).toBe(1050);
    expect((cprLayer?.rect.x ?? 0) + (cprLayer?.rect.width ?? 0)).toBe(1890);
    expect(cprLayer?.effect.shadowEnabled).toBe(false);
  });

  it('creates one batch export item for every asset and board combination', () => {
    const items = createBatchExportItems(
      [
        { id: 'asset_a', fileName: 'a.jpg', objectUrl: 'blob:a', width: 1000, height: 1000, fileSize: 500000, mimeType: 'image/jpeg' },
        { id: 'asset_b', fileName: 'b.png', objectUrl: 'blob:b', width: 1000, height: 1000, fileSize: 900000, mimeType: 'image/png' }
      ],
      [
        { id: 'spec_a', name: 'square', width: 1080, height: 1080, format: 'png' },
        { id: 'spec_b', name: 'wide', width: 1920, height: 1080, format: 'jpg' }
      ]
    );
    expect(items).toHaveLength(4);
    expect(new Set(items.map((item) => item.id)).size).toBe(4);
  });

  it('estimates export sizes in bytes and formats them as MB', () => {
    const asset = { id: 'asset', fileName: 'kv.jpg', objectUrl: 'blob:kv', width: 2000, height: 1000, fileSize: 1200000, mimeType: 'image/jpeg' };
    const spec = { id: 'spec', name: 'wide', width: 1920, height: 1080, format: 'jpg' as const };
    const jpgBytes = estimateExportBytes(asset, spec, 'jpg', 0.8);
    const pngBytes = estimateExportBytes(asset, spec, 'png', 0.8);
    expect(jpgBytes).toBeGreaterThan(0);
    expect(pngBytes).toBeGreaterThan(jpgBytes);
    expect(formatMegabytes(1024 * 1024)).toBe('1.00 MB');
  });

  it('uses 8MiB by default and honors explicit spec limits', () => {
    const defaultSpec = { id: 'default', name: 'default', width: 100, height: 100, format: 'jpg' as const };
    const explicitSpec = { ...defaultSpec, id: 'explicit', maxSizeKb: 3072 };
    expect(DEFAULT_MAX_SIZE_KB).toBe(8192);
    expect(getEffectiveMaxSizeKb(defaultSpec)).toBe(8192);
    expect(getEffectiveMaxSizeKb(explicitSpec)).toBe(3072);
    expect(isOverSizeLimit(1.4 * 1024 * 1024, DEFAULT_MAX_SIZE_KB)).toBe(false);
    expect(isOverSizeLimit(8.1 * 1024 * 1024, DEFAULT_MAX_SIZE_KB)).toBe(true);
    expect(PRESET_TEMPLATES.flatMap((preset) => preset.specs).every((spec) => spec.maxSizeKb === undefined)).toBe(true);
  });

  it('keeps a compliant JPG at its starting quality', async () => {
    let calls = 0;
    const result = await exportJpegWithinLimit({
      initialQuality: 0.9,
      maxBytes: 1000,
      encode: async () => { calls += 1; return new Blob([new Uint8Array(900)]); }
    });
    expect(result).toMatchObject({ ok: true, quality: 0.9, compressed: false });
    expect(calls).toBe(1);
  });

  it('finds the highest JPG quality that fits and fails below the quality floor', async () => {
    const encode = async (quality: number) => new Blob([new Uint8Array(Math.round(quality * 1000))]);
    const result = await exportJpegWithinLimit({ initialQuality: 0.9, minQuality: 0.4, maxBytes: 700, encode });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quality).toBeGreaterThan(0.69);
    const failure = await exportJpegWithinLimit({ initialQuality: 0.9, minQuality: 0.4, maxBytes: 300, encode });
    expect(failure).toMatchObject({ ok: false, minQuality: 0.4 });
  });

  it('creates raster brand assets with reusable dimensions and effect defaults', () => {
    const asset = createRasterBrandAsset({
      id: 'png',
      type: 'logo',
      name: 'Logo PNG',
      language: 'custom',
      sourceUrl: '/logo.png',
      width: 1200,
      height: 300
    });
    expect(asset.aspectRatio).toBe(4);
    expect(asset.viewBoxSize).toEqual({ width: 1200, height: 300 });
    expect(DEFAULT_LOGO_EFFECT.strokeWidth).toBeGreaterThan(0);
    expect(DEFAULT_LOGO_EFFECT.colorEnabled).toBe(false);
  });

  it('rejects SVG with script or remote references for local preview safety', () => {
    expect(() =>
      createBrandAsset({
        id: 'bad',
        type: 'cpr',
        name: 'bad.svg',
        language: 'en-US',
        svgText: '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'
      })
    ).toThrow(/script/);
    expect(() =>
      createBrandAsset({
        id: 'remote',
        type: 'logo',
        name: 'remote.svg',
        language: 'en-US',
        svgText: '<svg viewBox="0 0 1 1"><image href="https://example.com/a.png"/></svg>'
      })
    ).toThrow(/远程资源/);
    expect(() =>
      createBrandAsset({
        id: 'protocol-relative',
        type: 'logo',
        name: 'protocol.svg',
        language: 'en-US',
        svgText: '<svg viewBox="0 0 1 1"><use href="//example.com/icon.svg#x"/></svg>'
      })
    ).toThrow(/远程资源/);
    expect(() =>
      createBrandAsset({
        id: 'style-remote',
        type: 'cpr',
        name: 'style.svg',
        language: 'en-US',
        svgText: '<svg viewBox="0 0 1 1"><style>@import url("https://example.com/a.css");</style></svg>'
      })
    ).toThrow(/外部资源/);
  });
});
