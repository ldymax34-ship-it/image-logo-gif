import { describe, it, expect } from 'vitest';
import type { MaterialAsset } from '../core';
import { buildWatermarkRenderInput } from './watermarkExport';
import { buildWatermarkExportItems, createWorkbenchWatermarkConfig, imageFormatForName, type WatermarkBusinessConfig } from './WatermarkWorkbench';

function asset(name: string, w: number, h: number): MaterialAsset {
  return { id: name, fileName: name, objectUrl: `blob:${name}`, width: w, height: h, fileSize: 1, mimeType: name.endsWith('.jpg') ? 'image/jpeg' : 'image/png' };
}

const config: WatermarkBusinessConfig = { contentKind: 'text', text: '水印', fontSize: 5, rotation: 45, opacity: 0.5, offsetX: 0, offsetY: 0, pattern: 'brick', density: 'dense', phaseOffset: 0.5, textStyle: 'white', anchor: 'center' };

describe('watermark export orchestration', () => {
  it('maps PNG→PNG, JPEG→JPG, WebP→PNG', () => {
    expect(imageFormatForName('a.png')).toBe('png');
    expect(imageFormatForName('a.jpeg')).toBe('jpg');
    expect(imageFormatForName('a.jpg')).toBe('jpg');
    expect(imageFormatForName('a.webp')).toBe('png');
  });

  it('produces non-overwriting names for duplicate sources', () => {
    const a = asset('photo.png', 100, 50);
    const b = asset('photo.png', 100, 50);
    const items = buildWatermarkExportItems([a, b], 'original');
    expect(items.map((i) => i.fileName).sort()).toEqual(['photo_100x50.png', 'photo_100x50_2.png']);
  });

  it('keeps preview and export config deep-equal via the shared builder', () => {
    const a = asset('photo.png', 1000, 500);
    const spec = buildWatermarkExportItems([a], 'original')[0].spec;
    const previewInput = buildWatermarkRenderInput({ asset: a, spec }, config, undefined, undefined, {});
    const exportInput = buildWatermarkRenderInput({ asset: a, spec }, config, undefined, undefined, {});
    expect(previewInput.watermarkConfig).toEqual(exportInput.watermarkConfig);
    // same builder produces identical expanded layers for a shared config
    expect(createWorkbenchWatermarkConfig(spec, config)).toEqual(previewInput.watermarkConfig);
  });

  it('keeps original and existing proportional output presets', () => {
    const a = asset('photo.png', 1200, 800);
    const original = buildWatermarkExportItems([a], 'original')[0].spec;
    const medium = buildWatermarkExportItems([a], 'medium')[0].spec;
    expect(original).toMatchObject({ width: 1200, height: 800, format: 'png' });
    expect(medium).toMatchObject({ width: 600, height: 400, format: 'png' });
  });
});
