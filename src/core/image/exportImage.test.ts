// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createInitialCropState } from './crop';
import { DEFAULT_BRAND_LAYER } from '../brand';
import { buildWatermarkRenderLayers, type WatermarkConfig } from './watermarkRenderPlan';
import { buildBoardRenderPlan, drawWatermarkLayers } from './exportImage';
import type { BoardRenderInput } from './exportImage';
import type { MaterialAsset } from './imageMeta';

const textLayer = {
  id: 'wm:0:0', kind: 'text' as const, text: '水印', fontFamily: 'Arial', color: '#fff', fontSize: 20,
  cx: 50, cy: 30, rotation: 45, opacity: .3,
};

describe('drawWatermarkLayers', () => {
  it('restores the canvas context when an image layer fails to load', async () => {
    const context = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    const OriginalImage = globalThis.Image;
    class BrokenImage {
      decoding = 'async';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
      decode() { return Promise.reject(new Error('decode failed')); }
    }
    vi.stubGlobal('Image', BrokenImage);
    await expect(drawWatermarkLayers(context, [{
      id: 'wm:0:0', kind: 'image', src: 'blob:broken', width: 20, height: 10,
      cx: 5, cy: 5, rotation: 45, opacity: .5,
    }])).rejects.toThrow('图片加载失败');
    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.restore).toHaveBeenCalledTimes(1);
    vi.stubGlobal('Image', OriginalImage);
  });

  it('draws text with centered transform, rotation, alpha and balanced restore', async () => {
    const alpha = vi.fn();
    const context = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillText: vi.fn(),
      fillStyle: '', font: '', textAlign: '', textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(context, 'globalAlpha', { set: alpha });

    await drawWatermarkLayers(context, [textLayer]);

    expect(context.save).toHaveBeenCalledOnce();
    expect(context.translate).toHaveBeenCalledWith(50, 30);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 4);
    expect(alpha).toHaveBeenCalledWith(.3);
    expect(context.fillText).toHaveBeenCalledWith('水印', 0, 0);
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it('loads a repeated watermark image once and draws every instance', async () => {
    const OriginalImage = globalThis.Image;
    const constructed = vi.fn();
    class LoadedImage {
      decoding = 'async';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { constructed(); }
      set src(_value: string) {}
      decode() { return Promise.resolve(); }
    }
    vi.stubGlobal('Image', LoadedImage);
    try {
      const context = {
        save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(), globalAlpha: 1,
      } as unknown as CanvasRenderingContext2D;
      const imageLayer = { id: 'wm:0:0', kind: 'image' as const, src: 'blob:shared', width: 20, height: 10, cx: 5, cy: 5, rotation: 0, opacity: 1 };
      await drawWatermarkLayers(context, [imageLayer, { ...imageLayer, id: 'wm:0:1', cx: 20 }]);
      expect(constructed).toHaveBeenCalledOnce();
      expect(context.drawImage).toHaveBeenCalledTimes(2);
      expect(context.restore).toHaveBeenCalledTimes(2);
    } finally {
      vi.stubGlobal('Image', OriginalImage);
    }
  });
});

describe('buildBoardRenderPlan watermark integration', () => {
  const asset: MaterialAsset = { id: 'asset', fileName: 'background.png', objectUrl: 'blob:background', width: 100, height: 50, fileSize: 1, mimeType: 'image/png' };
  const spec = { id: 'spec', name: 'spec', width: 100, height: 50, format: 'png' as const };
  const previewState = { assetId: asset.id, specId: spec.id, fitMode: 'contain' as const, crop: createInitialCropState(asset, spec, 'contain') };
  const config: WatermarkConfig = { kind: 'text', text: '同源', fontFamily: 'Arial', color: '#fff', fontSize: 12, pattern: 'tiled', rotation: 45, opacity: .4, offsetX: 0, offsetY: 0, spacingX: 50, spacingY: 40 };
  const input = (overrides: Partial<BoardRenderInput> = {}): BoardRenderInput => ({ asset, spec, previewState, brandLayer: { ...DEFAULT_BRAND_LAYER, logoEnabled: false, cprEnabled: false }, ...overrides });

  it('has no watermark layers in both normal and logo-group branches without config', () => {
    expect(buildBoardRenderPlan(input()).watermarkLayers).toEqual([]);
    expect(buildBoardRenderPlan(input({ brandLayer: {
      ...DEFAULT_BRAND_LAYER,
      logoEnabled: false,
      cprEnabled: false,
      logoGroup: { mode: 'game-only', gameLogoLanguage: 'zh-CN', colorMode: 'white', sizePreset: 'standard', scale: 1, companyLogoScale: 'match', gapUnits: .5, placement: 'corner-right' },
    } })).watermarkLayers).toEqual([]);
  });

  it('uses the same watermark builder output in both plan branches', () => {
    const expected = buildWatermarkRenderLayers({ width: spec.width, height: spec.height }, config);
    expect(buildBoardRenderPlan(input({ watermarkConfig: config })).watermarkLayers).toEqual(expected);
    expect(buildBoardRenderPlan(input({
      watermarkConfig: config,
      brandLayer: {
        ...DEFAULT_BRAND_LAYER,
        logoEnabled: false,
        cprEnabled: false,
        logoGroup: { mode: 'game-only', gameLogoLanguage: 'zh-CN', colorMode: 'white', sizePreset: 'standard', scale: 1, companyLogoScale: 'match', gapUnits: .5, placement: 'corner-right' },
      },
    })).watermarkLayers).toEqual(expected);
  });
});
