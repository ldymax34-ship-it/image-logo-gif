import { describe, expect, it } from 'vitest';
import {
  buildOutputFileName,
  classifyAspect,
  computeCprLayout,
  computeFitRect,
  computeLogoLayout,
  DEFAULT_BRAND_ASSETS,
  DEFAULT_LOGO_EFFECT,
  createBrandAsset,
  createRasterBrandAsset,
  createInitialCropState,
  getBoardPreviewKey,
  parseSpecText,
  panCropState,
  renderBrandLayer,
  sanitizeFileNamePart,
  zoomCropState
} from './index';

describe('core 0.1.x foundation', () => {
  it('parses size fragments and keeps unrecognized lines', () => {
    const result = parseSpecText('1080x1920\n16:9 1920\nbad line');
    expect(result.specs.map((spec) => `${spec.width}x${spec.height}`)).toEqual(['1080x1920', '1920x1080']);
    expect(result.unrecognizedLines).toHaveLength(1);
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
    expect(DEFAULT_BRAND_ASSETS.length).toBeGreaterThanOrEqual(6);
    expect(DEFAULT_BRAND_ASSETS.every((asset) => asset.sourceKind === 'image')).toBe(true);
    expect(DEFAULT_BRAND_ASSETS.map((asset) => asset.sourceUrl)).toContain('/brand-logos/company/kuro-en-white.png');
    expect(DEFAULT_BRAND_ASSETS.map((asset) => asset.sourceUrl)).toContain('/brand-logos/wuthering-waves/ww-zh-cn.png');
    expect(DEFAULT_BRAND_ASSETS.every((asset) => asset.aspectRatio && asset.aspectRatio > 0)).toBe(true);
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
