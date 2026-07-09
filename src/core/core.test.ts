import { describe, expect, it } from 'vitest';
import {
  buildOutputFileName,
  classifyAspect,
  computeCprLayout,
  computeLogoLayout,
  parseSpecText,
  renderBrandLayer,
  sanitizeFileNamePart
} from './index';

describe('core 0.8.0 foundation', () => {
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
});
