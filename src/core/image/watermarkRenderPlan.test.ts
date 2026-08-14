import { describe, it, expect } from 'vitest';
import {
  buildWatermarkRenderLayers,
  adaptWatermarkConfig,
  type WatermarkConfig,
} from './watermarkRenderPlan';
import type { MaterialAsset } from './imageMeta';

const CANVAS = { width: 1000, height: 500 };

function textConfig(overrides: Partial<WatermarkConfig> = {}): WatermarkConfig {
  return {
    kind: 'text',
    text: '水印',
    fontFamily: 'Source Han Sans SC',
    color: '#ffffff',
    fontSize: 50,
    pattern: 'single',
    rotation: 0,
    opacity: 0.5,
    offsetX: 0,
    offsetY: 0,
    spacingX: 200,
    spacingY: 150,
    ...overrides,
  } as WatermarkConfig;
}

function imageConfig(overrides: Partial<WatermarkConfig> = {}): WatermarkConfig {
  return {
    kind: 'image',
    src: 'blob:logo',
    intrinsicWidth: 200,
    intrinsicHeight: 100,
    displayWidth: 250,
    pattern: 'single',
    rotation: 0,
    opacity: 0.8,
    offsetX: 0,
    offsetY: 0,
    spacingX: 200,
    spacingY: 150,
    ...overrides,
  } as WatermarkConfig;
}

function makeAsset(overrides: Partial<MaterialAsset> = {}): MaterialAsset {
  return { id: 'a1', fileName: 'logo.png', objectUrl: 'blob:logo', width: 200, height: 100, fileSize: 1000, mimeType: 'image/png', ...overrides };
}

describe('buildWatermarkRenderLayers', () => {
  /* ── single ── */
  it('single text: one instance at center+offset', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ offsetX: 10, offsetY: 20, rotation: 45, opacity: 0.7 }));
    expect(layers).toHaveLength(1);
    const l = layers[0];
    expect(l.cx).toBe(510); // 500 + 10
    expect(l.cy).toBe(270); // 250 + 20
    expect(l.rotation).toBe(45);
    expect(l.opacity).toBe(0.7);
    expect(l.kind).toBe('text');
    if (l.kind !== 'text') throw new Error('expected text');
    expect(l.text).toBe('水印');
  });

  it('single image: one instance, aspect-correct height', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, imageConfig());
    expect(layers).toHaveLength(1);
    const l = layers[0];
    expect(l.kind).toBe('image');
    if (l.kind !== 'image') throw new Error('expected image');
    expect(l.src).toBe('blob:logo');
    expect(l.width).toBe(250);
    expect(l.height).toBe(125); // 250 * (100/200)
  });

  /* ── 45° + opacity ── */
  it('45° rotation and opacity are preserved', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ rotation: 45, opacity: 0.3 }));
    expect(layers[0].rotation).toBe(45);
    expect(layers[0].opacity).toBe(0.3);
  });

  /* ── determinism / deepEqual ── */
  it('same config produces deepEqual layers', () => {
    const cfg = textConfig({ pattern: 'tiled', spacingX: 100, spacingY: 80 });
    const a = buildWatermarkRenderLayers(CANVAS, cfg);
    const b = buildWatermarkRenderLayers(CANVAS, cfg);
    expect(a).toEqual(b);
  });

  /* ── tiled ── */
  it('tiled produces more than one instance', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled' }));
    expect(layers.length).toBeGreaterThan(1);
  });

  it('staggered differs from tiled by shifting odd rows', () => {
    const tiled = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: 200, spacingY: 200 }));
    const staggered = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'staggered', spacingX: 200, spacingY: 200, phaseOffset: 0.5 }));
    expect(staggered.length).toBe(tiled.length);
    // Every odd row (grid row index) is horizontally shifted by phase * spacingX.
    const byRow = new Map<string, number[]>();
    for (const layer of staggered) {
      const row = layer.id.split(':')[1];
      byRow.set(row, [...(byRow.get(row) ?? []), layer.cx]);
    }
    const tiledByRow = new Map<string, number[]>();
    for (const layer of tiled) {
      const row = layer.id.split(':')[1];
      tiledByRow.set(row, [...(tiledByRow.get(row) ?? []), layer.cx]);
    }
    let sawShift = false;
    for (const row of byRow.keys()) {
      const shift = (byRow.get(row)![0] ?? 0) - (tiledByRow.get(row)![0] ?? 0);
      if (Math.abs(shift) > 0.5) sawShift = true;
    }
    expect(sawShift).toBe(true);
  });

  it('staggered phase offset controls the row shift magnitude', () => {
    const half = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'staggered', spacingX: 200, spacingY: 200, phaseOffset: 0.25 }));
    const full = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'staggered', spacingX: 200, spacingY: 200, phaseOffset: 0.5 }));
    const pickRow1X = (layers: { id: string; cx: number }[]) => layers.filter((l) => l.id.startsWith('wm:1:')).map((l) => l.cx).sort((a, b) => a - b);
    expect(pickRow1X(full)[0]).not.toBe(pickRow1X(half)[0]);
  });

  it('larger spacing → fewer instances', () => {
    const small = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: 50, spacingY: 50 })).length;
    const large = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: 500, spacingY: 500 })).length;
    expect(large).toBeLessThan(small);
  });

  it('spacing change alters instance count and positions', () => {
    const a = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: 100, spacingY: 100 }));
    const b = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: 200, spacingY: 200 }));
    expect(a.length).not.toBe(b.length);
    expect(a[0].cx).not.toBe(b[0].cx); // different grid start
  });

  /* ── safety ── */
  it('zero spacing clamped to minimum, no infinite loop', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: 0, spacingY: 0 }));
    expect(layers.length).toBeLessThanOrEqual(500);
    expect(layers.length).toBeGreaterThan(0);
  });

  it('negative spacing clamped to minimum', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: -10, spacingY: -10 }));
    expect(layers.length).toBeLessThanOrEqual(500);
    expect(layers.length).toBeGreaterThan(0);
  });

  it('single-line tiled ids retain the legacy row:col shape', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: 200, spacingY: 200 }));
    const ids = layers.map(l => l.id);
    for (const id of ids) {
      expect(id).toMatch(/^wm:\d+:\d+$/);
    }
    // no duplicates
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('multi-line text expands each cell with preserved blank lines', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ text: '第一行\n\n第三行', fontSize: 50 }));
    expect(layers).toHaveLength(3);
    expect(layers.map((layer) => layer.id)).toEqual(['wm:0:0:L0', 'wm:0:0:L1', 'wm:0:0:L2']);
    expect(layers.map((layer) => layer.kind === 'text' ? layer.text : '')).toEqual(['第一行', '', '第三行']);
    expect(layers[1].cy - layers[0].cy).toBe(60);
  });

  it('multi-line tiled output remains capped after line expansion', () => {
    const layers = buildWatermarkRenderLayers(
      { width: 99999, height: 99999 },
      textConfig({ pattern: 'tiled', text: Array.from({ length: 20 }, (_value, index) => `line ${index}`).join('\n'), spacingX: 1, spacingY: 1 }),
    );
    expect(layers.length).toBeLessThanOrEqual(500);
    expect(layers.every((layer) => /^wm:\d+:\d+:L\d+$/.test(layer.id))).toBe(true);
  });

  /* ── image zero intrinsic width ── */
  it('image with zero intrinsic width falls back to aspect 1', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, imageConfig({ intrinsicWidth: 0, intrinsicHeight: 0 }));
    if (layers[0].kind !== 'image') throw new Error('expected image');
    expect(layers[0].height).toBe(layers[0].width); // aspect 1
  });
});

describe('adaptWatermarkConfig', () => {
  it('text: maps state fields to config', () => {
    const cfg = adaptWatermarkConfig(CANVAS, {
      kind: 'text', pattern: 'single', text: '测试', fontFamily: 'Arial', color: '#000',
      scale: 2, rotation: 30, opacity: 0.6, x: 10, y: 20, density: 'medium',
    });
    expect(cfg).toBeDefined();
    expect(cfg!.kind).toBe('text');
    if (cfg!.kind !== 'text') throw new Error('expected text');
    expect(cfg!.text).toBe('测试');
    expect(cfg!.rotation).toBe(30);
    expect(cfg!.opacity).toBe(0.6);
    expect(cfg!.offsetX).toBe(10);
    expect(cfg!.offsetY).toBe(20);
    // min(cw=1000, ch=500) * 0.05 * scale=2 = 500 * 0.05 * 2 = 50
    expect(cfg!.fontSize).toBe(50);
  });

  it('image: uses MaterialAsset objectUrl and computes displayWidth', () => {
    const asset = makeAsset();
    const cfg = adaptWatermarkConfig(CANVAS, {
      kind: 'image', pattern: 'single', text: '', fontFamily: '', color: '',
      scale: 1, rotation: 0, opacity: 0.5, x: 0, y: 0, density: 'medium',
      imageAsset: asset,
    });
    expect(cfg).toBeDefined();
    expect(cfg!.kind).toBe('image');
    if (cfg!.kind !== 'image') throw new Error('expected image');
    expect(cfg!.src).toBe('blob:logo');
    expect(cfg!.displayWidth).toBe(250); // 1000 * 1 * 0.25
  });

  it('image without asset returns undefined', () => {
    const cfg = adaptWatermarkConfig(CANVAS, {
      kind: 'image', pattern: 'single', text: '', fontFamily: '', color: '',
      scale: 1, rotation: 0, opacity: 0.5, x: 0, y: 0, density: 'medium',
    });
    expect(cfg).toBeUndefined();
  });

  it('diagonal pattern maps to tiled', () => {
    const cfg = adaptWatermarkConfig(CANVAS, {
      kind: 'text', pattern: 'diagonal', text: 'x', fontFamily: '', color: '',
      scale: 1, rotation: 45, opacity: 0.5, x: 0, y: 0, density: 'high',
    });
    expect(cfg!.pattern).toBe('tiled');
  });

  it('custom spacing overrides density preset', () => {
    const cfg = adaptWatermarkConfig(CANVAS, {
      kind: 'text', pattern: 'tiled', text: 'x', fontFamily: '', color: '',
      scale: 1, rotation: 0, opacity: 0.5, x: 0, y: 0, density: 'medium',
      spacingX: 777, spacingY: 888,
    });
    expect(cfg!.spacingX).toBe(777);
    expect(cfg!.spacingY).toBe(888);
  });

  it('font size uses short edge as baseline for landscape canvas', () => {
    const cfg = adaptWatermarkConfig({ width: 2000, height: 600 }, {
      kind: 'text', pattern: 'single', text: 'a', fontFamily: '', color: '',
      scale: 1, rotation: 0, opacity: 0.5, x: 0, y: 0, density: 'medium',
    });
    // short edge * 0.05 = 600 * 0.05 = 30
    if (cfg!.kind !== 'text') throw new Error('expected text');
    expect(cfg!.fontSize).toBe(30);
  });

  it('font size uses short edge as baseline for portrait canvas', () => {
    const cfg = adaptWatermarkConfig({ width: 600, height: 2000 }, {
      kind: 'text', pattern: 'single', text: 'a', fontFamily: '', color: '',
      scale: 1, rotation: 0, opacity: 0.5, x: 0, y: 0, density: 'medium',
    });
    // short edge * 0.05 = 600 * 0.05 = 30
    if (cfg!.kind !== 'text') throw new Error('expected text');
    expect(cfg!.fontSize).toBe(30);
  });

  it('font size respects scale multiplier', () => {
    const cfg = adaptWatermarkConfig({ width: 1000, height: 500 }, {
      kind: 'text', pattern: 'single', text: 'a', fontFamily: '', color: '',
      scale: 3, rotation: 0, opacity: 0.5, x: 0, y: 0, density: 'medium',
    });
    // 500 * 0.05 * 3 = 75
    if (cfg!.kind !== 'text') throw new Error('expected text');
    expect(cfg!.fontSize).toBe(75);
  });
});

describe('buildWatermarkRenderLayers — boundary safety', () => {
  it('MAX_INSTANCES never exceeded even with tiny spacing', () => {
    const layers = buildWatermarkRenderLayers({ width: 99999, height: 99999 }, textConfig({ pattern: 'tiled', spacingX: 1, spacingY: 1 }));
    expect(layers.length).toBeLessThanOrEqual(500);
  });

  it('scaled-up spacing keeps grid centered and covering', () => {
    const canvas = { width: 99999, height: 99999 };
    const layers = buildWatermarkRenderLayers(canvas, textConfig({ pattern: 'tiled', spacingX: 1, spacingY: 1, offsetX: 0, offsetY: 0 }));
    // Grid should be centered and span each axis's rotation overscan.
    const cxs = [...new Set(layers.map(l => l.cx))].sort((a, b) => a - b);
    const cys = [...new Set(layers.map(l => l.cy))].sort((a, b) => a - b);
    const spacingX = cxs[1] - cxs[0];
    const spacingY = cys[1] - cys[0];
    const diagonal = Math.sqrt(canvas.width ** 2 + canvas.height ** 2);
    const halfX = diagonal / 2 + spacingX;
    const halfY = diagonal / 2 + spacingY;
    expect(cxs[cxs.length - 1] - cxs[0]).toBeGreaterThanOrEqual(halfX * 2);
    expect(cys[cys.length - 1] - cys[0]).toBeGreaterThanOrEqual(halfY * 2);
  });

  it.each([
    [1_000_000_000, 1],
    [1, 1_000_000_000],
  ])('converges and preserves independent overscan for asymmetric spacing %d × %d', (spacingX, spacingY) => {
    const canvas = { width: 99999, height: 99999 };
    const layers = buildWatermarkRenderLayers(canvas, textConfig({ pattern: 'tiled', spacingX, spacingY }));
    expect(layers.length).toBeGreaterThan(0);
    expect(layers.length).toBeLessThanOrEqual(500);
    for (const layer of layers) {
      expect(Number.isFinite(layer.cx)).toBe(true);
      expect(Number.isFinite(layer.cy)).toBe(true);
    }
    const cxs = [...new Set(layers.map(layer => layer.cx))].sort((left, right) => left - right);
    const cys = [...new Set(layers.map(layer => layer.cy))].sort((left, right) => left - right);
    const finalSpacingX = cxs[1] - cxs[0];
    const finalSpacingY = cys[1] - cys[0];
    const diagonal = Math.sqrt(canvas.width ** 2 + canvas.height ** 2);
    expect(cxs[cxs.length - 1] - cxs[0]).toBeGreaterThanOrEqual(2 * (diagonal / 2 + finalSpacingX));
    expect(cys[cys.length - 1] - cys[0]).toBeGreaterThanOrEqual(2 * (diagonal / 2 + finalSpacingY));
  });

  it('non-finite canvas returns empty', () => {
    expect(buildWatermarkRenderLayers({ width: NaN, height: 500 }, textConfig())).toEqual([]);
    expect(buildWatermarkRenderLayers({ width: 0, height: 500 }, textConfig())).toEqual([]);
    expect(buildWatermarkRenderLayers({ width: -10, height: 500 }, textConfig())).toEqual([]);
  });

  it('non-finite rotation defaults to 0', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ rotation: NaN }));
    expect(layers[0].rotation).toBe(0);
  });

  it('non-finite offset defaults to 0', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ offsetX: Infinity, offsetY: -Infinity }));
    expect(layers[0].cx).toBe(500);
    expect(layers[0].cy).toBe(250);
  });

  it('opacity clamped to 0..1', () => {
    expect(buildWatermarkRenderLayers(CANVAS, textConfig({ opacity: -0.5 }))[0].opacity).toBe(0);
    expect(buildWatermarkRenderLayers(CANVAS, textConfig({ opacity: 2 }))[0].opacity).toBe(1);
    expect(buildWatermarkRenderLayers(CANVAS, textConfig({ opacity: NaN }))[0].opacity).toBe(0.5);
  });

  it('non-finite spacing clamped to minimum', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled', spacingX: NaN, spacingY: NaN }));
    expect(layers.length).toBeGreaterThan(0);
    expect(layers.length).toBeLessThanOrEqual(500);
  });

  it('tiled with adjusted spacing is still deterministic', () => {
    const cfg = textConfig({ pattern: 'tiled', spacingX: 1, spacingY: 1 });
    const a = buildWatermarkRenderLayers({ width: 99999, height: 99999 }, cfg);
    const b = buildWatermarkRenderLayers({ width: 99999, height: 99999 }, cfg);
    expect(a).toEqual(b);
  });
});
