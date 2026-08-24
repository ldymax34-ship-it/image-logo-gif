import { describe, expect, it } from 'vitest';
import { buildWatermarkCenters } from '../core/image/watermarkRenderPlan';
import { DEFAULT_CONFIG } from './WatermarkWorkbench';
import { videoCanvasSize, videoWatermarkConfigForCanvas, videoWatermarkLayers, videoWatermarkPlacements } from './videoWatermarkPlan';
import type { VideoWatermarkAsset } from './videoWatermarkAdapter';

const asset: VideoWatermarkAsset = {
  id: 'video-1',
  inputPath: '/tmp/clip.mp4',
  fileName: 'clip.mp4',
  metadata: { duration: 4, width: 3840, height: 2160, fps: 30, codec: 'h264', hasAudio: true },
};

describe('video watermark plan', () => {
  it('derives the canvas config from the same short-edge percent and density', () => {
    const config = { ...DEFAULT_CONFIG, fontSize: 5 };
    const canvas = videoWatermarkConfigForCanvas({ width: 960, height: 540 }, config);
    expect(canvas.kind).toBe('text');
    if (canvas.kind === 'text') expect(canvas.fontSize).toBe(540 * 0.05);
    expect(canvas.pattern).toBe('brick');
    expect(canvas.density).toBe('dense');
    expect(canvas.phaseOffset).toBe(0.5);
  });

  it('uses the exact 1% short-edge font size for preview layers and FFmpeg placements', () => {
    const previewAsset: VideoWatermarkAsset = {
      ...asset,
      metadata: { ...asset.metadata!, width: 960, height: 540 },
    };
    const config = { ...DEFAULT_CONFIG, fontSize: 1 };
    const canvasConfig = videoWatermarkConfigForCanvas({ width: 960, height: 540 }, config);
    expect(canvasConfig.kind).toBe('text');
    if (canvasConfig.kind === 'text') expect(canvasConfig.fontSize).toBeCloseTo(5.4, 10);

    const layers = videoWatermarkLayers(previewAsset, config);
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.kind).toBe('text');
      if (layer.kind === 'text') expect(layer.fontSize).toBeCloseTo(5.4, 10);
    }

    const source = { width: 960, height: 540 };
    const centers = buildWatermarkCenters(source, videoWatermarkConfigForCanvas(source, config));
    const placements = videoWatermarkPlacements(previewAsset, config);
    expect(placements).toHaveLength(centers.length);
    centers.forEach((center, index) => {
      expect(placements[index].xPercent).toBeCloseTo(center.cx / source.width * 100, 8);
      expect(placements[index].yPercent).toBeCloseTo(center.cy / source.height * 100, 8);
    });
  });

  it('returns preview-canvas-space layers bounded by the preview width', () => {
    const config = { ...DEFAULT_CONFIG, fontSize: 5 };
    const canvas = videoCanvasSize(asset);
    const layers = videoWatermarkLayers(asset, config);
    expect(layers.length).toBeGreaterThan(0);
    layers.forEach((layer) => {
      expect(layer.cx).toBeGreaterThanOrEqual(-canvas.width);
      expect(layer.cx).toBeLessThanOrEqual(canvas.width * 2);
      expect(layer.cy).toBeGreaterThanOrEqual(-canvas.height);
      expect(layer.cy).toBeLessThanOrEqual(canvas.height * 2);
    });
  });

  it('keeps FFmpeg placements consistent with the shared plan geometry', () => {
    const config = { ...DEFAULT_CONFIG, fontSize: 5 };
    const canvas = videoCanvasSize(asset);
    const layers = videoWatermarkLayers(asset, config);
    const placements = videoWatermarkPlacements(asset, config);
    expect(layers.length).toBe(placements.length);
    layers.forEach((layer, index) => {
      expect(placements[index].xPercent).toBeCloseTo(layer.cx / canvas.width * 100, 2);
      expect(placements[index].yPercent).toBeCloseTo(layer.cy / canvas.height * 100, 2);
    });
  });

  it('keeps a bounded brick plan for 4K with the long copyright text', () => {
    const config = { ...DEFAULT_CONFIG, fontSize: 3 };
    const layers = videoWatermarkLayers(asset, config);
    expect(layers.length).toBeGreaterThanOrEqual(4);
    expect(layers.length).toBeLessThanOrEqual(60);
    expect(videoWatermarkPlacements(asset, config).length).toBe(layers.length);
  });

  it('keeps the single pattern anchored to the requested corner', () => {
    const config = { ...DEFAULT_CONFIG, pattern: 'single' as const, anchor: 'bottom-right' as const };
    const canvas = videoCanvasSize(asset);
    const layers = videoWatermarkLayers(asset, config);
    expect(layers).toHaveLength(1);
    const l = layers[0];
    expect(l.cx).toBeCloseTo(canvas.width / 2 + canvas.width / 2);
    expect(l.cy).toBeCloseTo(canvas.height / 2 + canvas.height / 2);
  });

  it('emits exactly one FFmpeg placement per brick center for two/three-line text', () => {
    const source = { width: asset.metadata?.width ?? 1920, height: asset.metadata?.height ?? 1080 };
    for (const text of ['A\nB', 'A\nB\nC']) {
      const config = { ...DEFAULT_CONFIG, fontSize: 5, text };
      const sharedConfig = videoWatermarkConfigForCanvas(source, config);
      const centers = buildWatermarkCenters(source, sharedConfig);
      const placements = videoWatermarkPlacements(asset, config);
      const layers = videoWatermarkLayers(asset, config);
      const lineCount = text.split('\n').length;
      expect(centers.length).toBeGreaterThan(0);
      // Preview still expands each center into one draw layer per line…
      expect(layers).toHaveLength(centers.length * lineCount);
      // …but FFmpeg placements stay one per brick center, never multiplied by line.
      expect(placements).toHaveLength(centers.length);
      expect(placements).not.toHaveLength(centers.length * lineCount);
      expect(placements.length).toBeLessThan(layers.length);
    }
  });

  it('keeps single-line placements 1:1 with the shared brick centers', () => {
    const source = { width: asset.metadata?.width ?? 1920, height: asset.metadata?.height ?? 1080 };
    const config = { ...DEFAULT_CONFIG, fontSize: 5, text: 'A' };
    const centers = buildWatermarkCenters(source, videoWatermarkConfigForCanvas(source, config));
    const placements = videoWatermarkPlacements(asset, config);
    expect(centers.length).toBeGreaterThan(0);
    expect(placements).toHaveLength(centers.length);
    expect(videoWatermarkLayers(asset, config)).toHaveLength(placements.length);
  });

  it('maps white/black/outlined text styles to fill and stroke semantics', () => {
    const source = { width: 960, height: 540 };

    const whiteConfig = videoWatermarkConfigForCanvas(source, { ...DEFAULT_CONFIG, textStyle: 'white' });
    expect(whiteConfig.kind).toBe('text');
    if (whiteConfig.kind === 'text') expect(whiteConfig.style).toBe('white');

    const blackLayers = videoWatermarkLayers(asset, { ...DEFAULT_CONFIG, textStyle: 'black' });
    for (const layer of blackLayers) {
      if (layer.kind !== 'text') continue;
      expect(layer.color).toBe('#000000');
      expect(layer.stroke).toBeUndefined();
    }

    const outlinedLayers = videoWatermarkLayers(asset, { ...DEFAULT_CONFIG, textStyle: 'outlined' });
    for (const layer of outlinedLayers) {
      if (layer.kind !== 'text') continue;
      expect(layer.color).toBe('#ffffff');
      expect(layer.stroke?.color).toBe('#000000');
      expect(layer.stroke?.width).toBeGreaterThanOrEqual(1);
      expect(layer.stroke?.width).toBeLessThan(layer.fontSize);
    }
  });
});
