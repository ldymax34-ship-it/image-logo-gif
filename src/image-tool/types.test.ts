import { describe, expect, it } from 'vitest';
import {
  clampTargetWidth,
  clampedSourceSize,
  DEFAULT_IMAGE_QUALITY,
  scaledImageHeight,
  formatImageBytes,
  formatOutputName,
  formatSpec,
  IMAGE_FORMAT_ORDER,
  isSupportedImageFile,
  MAX_SOURCE_EDGE,
  qualityForFormat,
  sizeChangeLabel,
} from './types';

describe('image compression helpers', () => {
  it('offers exactly three formats with the right extensions', () => {
    expect(IMAGE_FORMAT_ORDER).toEqual(['jpeg', 'webp', 'png']);
    expect(formatSpec('jpeg').extension).toBe('jpg');
    expect(formatSpec('webp').extension).toBe('webp');
    expect(formatSpec('png').extension).toBe('png');
    expect(formatSpec('png').supportsQuality).toBe(false);
    expect(formatSpec('jpeg').supportsQuality).toBe(true);
  });

  it('keeps the original name and appends -compressed instead of overwriting', () => {
    expect(formatOutputName('海报 01.png', 'jpeg')).toBe('海报 01-compressed.jpg');
    expect(formatOutputName('a.b.webp', 'webp')).toBe('a.b-compressed.webp');
    expect(formatOutputName('/Users/me/图片/截图.PNG', 'png')).toBe('截图-compressed.png');
    expect(formatOutputName('无扩展名', 'jpeg')).toBe('无扩展名-compressed.jpg');
    expect(formatOutputName('   ', 'jpeg')).toBe('图片-compressed.jpg');
  });

  it('accepts only the three supported image kinds', () => {
    expect(isSupportedImageFile({ name: 'a.jpg', type: 'image/jpeg' })).toBe(true);
    expect(isSupportedImageFile({ name: 'a.PNG', type: 'image/png' })).toBe(true);
    expect(isSupportedImageFile({ name: 'a.webp', type: 'image/webp' })).toBe(true);
    expect(isSupportedImageFile({ name: 'a.heic', type: 'image/heic' })).toBe(false);
    expect(isSupportedImageFile({ name: 'a.gif', type: 'image/gif' })).toBe(false);
  });

  it('never upscales and never exceeds the process edge limit', () => {
    expect(clampTargetWidth(undefined, 1200)).toBeUndefined();
    expect(clampTargetWidth(Number.NaN, 1200)).toBeUndefined();
    expect(clampTargetWidth(0, 1200)).toBeUndefined();
    expect(clampTargetWidth(-20, 1200)).toBeUndefined();
    expect(clampTargetWidth(800, 1200)).toBe(800);
    expect(clampTargetWidth(800.6, 1200)).toBe(801);
    expect(clampTargetWidth(4000, 1200)).toBe(1200);
    expect(clampTargetWidth(9999, 9999)).toBe(MAX_SOURCE_EDGE);
  });

  it('clamps only oversized sources and keeps aspect ratio', () => {
    expect(clampedSourceSize(4000, 3000)).toEqual({ width: 4000, height: 3000, clamped: false });
    expect(clampedSourceSize(10000, 5000)).toEqual({ width: MAX_SOURCE_EDGE, height: 2500, clamped: true });
    expect(clampedSourceSize(500, 20000)).toEqual({ width: 125, height: MAX_SOURCE_EDGE, clamped: true });
  });

  it('keeps original dimensions and derives proportional (not forced-even) heights', () => {
    // 不调整尺寸时原样保留，包括 101×101 与 1×1 这类奇数尺寸。
    expect(scaledImageHeight(101, 101, 101)).toBe(101);
    expect(scaledImageHeight(1, 1, 1)).toBe(1);
    expect(scaledImageHeight(1200, 800, 1200)).toBe(800);
    // 缩放时按比例四舍五入，不强制偶数。
    expect(scaledImageHeight(1200, 800, 600)).toBe(400);
    expect(scaledImageHeight(1000, 333, 500)).toBe(167);
    expect(scaledImageHeight(1000, 333, 100)).toBe(33);
    expect(scaledImageHeight(0, 0, 640)).toBe(640);
  });

  it('maps the quality slider to the active format', () => {
    expect(qualityForFormat('jpeg', 0, 2)).toBe(1);
    expect(qualityForFormat('jpeg', 150, 2)).toBe(100);
    expect(qualityForFormat('jpeg', Number.NaN, 2)).toBe(DEFAULT_IMAGE_QUALITY);
    expect(qualityForFormat('webp', 55.4, 2)).toBe(55);
    expect(qualityForFormat('png', 55, 4)).toBe(4);
  });

  it('formats sizes in decimal units and the size delta', () => {
    expect(formatImageBytes(0)).toBe('0 B');
    expect(formatImageBytes(999)).toBe('999 B');
    expect(formatImageBytes(1500)).toBe('1.5 KB');
    expect(formatImageBytes(8_000_000)).toBe('8.00 MB');
    expect(formatImageBytes(undefined)).toBe('—');
    expect(sizeChangeLabel(1000, 400)).toBe('-60%');
    expect(sizeChangeLabel(1000, 1040)).toBe('+4%');
    expect(sizeChangeLabel(1000, 1000)).toBe('0%');
    expect(sizeChangeLabel(0, 10)).toBe('—');
  });
});
