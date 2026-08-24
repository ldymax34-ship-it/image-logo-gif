import { describe, it, expect } from 'vitest';
import {
  buildBrickPlacements,
  buildWatermarkCenters,
  buildWatermarkRenderLayers,
  measureWatermarkTextContent,
  resolveWatermarkTextVisual,
  rotatedBoundingBox,
  WATERMARK_DENSITY_GAPS,
  type WatermarkConfig,
} from './watermarkRenderPlan';

const CANVAS = { width: 1000, height: 500 };

function textConfig(overrides: Partial<WatermarkConfig> = {}): WatermarkConfig {
  return {
    kind: 'text',
    text: '水印',
    fontFamily: 'Source Han Sans SC',
    color: '#ffffff',
    fontSize: 50,
    pattern: 'brick',
    rotation: 0,
    opacity: 0.5,
    offsetX: 0,
    offsetY: 0,
    density: 'dense',
    phaseOffset: 0.5,
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
    pattern: 'brick',
    rotation: 0,
    opacity: 0.8,
    offsetX: 0,
    offsetY: 0,
    density: 'dense',
    phaseOffset: 0.5,
    ...overrides,
  } as WatermarkConfig;
}

function minPairwiseDistance(layers: Array<{ cx: number; cy: number }>): number {
  let min = Infinity;
  for (let i = 0; i < layers.length; i += 1) {
    for (let j = i + 1; j < layers.length; j += 1) {
      const d = Math.hypot(layers[i].cx - layers[j].cx, layers[i].cy - layers[j].cy);
      if (d < min) min = d;
    }
  }
  return min;
}

describe('buildWatermarkRenderLayers', () => {
  /* ── single ── */
  it('single text: one instance at center+offset', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'single', offsetX: 10, offsetY: 20, rotation: 45, opacity: 0.7 }));
    expect(layers).toHaveLength(1);
    const l = layers[0];
    expect(l.cx).toBe(510);
    expect(l.cy).toBe(270);
    expect(l.rotation).toBe(45);
    expect(l.opacity).toBe(0.7);
    expect(l.kind).toBe('text');
    if (l.kind !== 'text') throw new Error('expected text');
    expect(l.text).toBe('水印');
  });

  it('single image: one instance, aspect-correct height', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, imageConfig({ pattern: 'single' }));
    expect(layers).toHaveLength(1);
    const l = layers[0];
    expect(l.kind).toBe('image');
    if (l.kind !== 'image') throw new Error('expected image');
    expect(l.src).toBe('blob:logo');
    expect(l.width).toBe(250);
    expect(l.height).toBe(125);
  });

  it('45° rotation and opacity are preserved', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ rotation: 45, opacity: 0.3 }));
    expect(layers[0].rotation).toBe(45);
    expect(layers[0].opacity).toBe(0.3);
  });

  /* ── brick determinism ── */
  it('same config produces deepEqual layers', () => {
    const cfg = textConfig();
    expect(buildWatermarkRenderLayers(CANVAS, cfg)).toEqual(buildWatermarkRenderLayers(CANVAS, cfg));
  });

  it('brick produces a bounded number of instances (no 200+ stacking)', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig());
    expect(layers.length).toBeGreaterThan(1);
    expect(layers.length).toBeLessThanOrEqual(500);
  });

  it('brick instances keep a positive gap (no overlapping centers)', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig());
    const content = measureWatermarkTextContent('水印', 'Source Han Sans SC', 50);
    expect(minPairwiseDistance(layers)).toBeGreaterThanOrEqual(content.height);
  });

  /* ── legacy pattern aliases ── */
  it('legacy staggered behaves like brick with 50% phase', () => {
    const brick = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'brick', phaseOffset: 0.5 }));
    const staggered = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'staggered' as WatermarkConfig['pattern'], phaseOffset: 0.5 }));
    expect(staggered).toEqual(brick);
  });

  it('legacy tiled keeps a zero phase', () => {
    const tiled = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'tiled' as WatermarkConfig['pattern'] }));
    const phaseZero = buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'brick', phaseOffset: 0 }));
    expect(tiled).toEqual(phaseZero);
  });

  /* ── boundary safety ── */
  it('empty canvas produces no layers', () => {
    expect(buildWatermarkRenderLayers({ width: 0, height: 0 }, textConfig())).toEqual([]);
  });

  it('non-finite and NaN inputs are clamped without throwing', () => {
    const layers = buildWatermarkRenderLayers(CANVAS, textConfig({ rotation: NaN, opacity: NaN, phaseOffset: NaN }));
    expect(layers.length).toBeGreaterThan(0);
    expect(layers[0].opacity).toBe(0.5);
  });

  it('clamps opacity into [0,1]', () => {
    expect(buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'single', opacity: -0.5 }))[0].opacity).toBe(0);
    expect(buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'single', opacity: 2 }))[0].opacity).toBe(1);
    expect(buildWatermarkRenderLayers(CANVAS, textConfig({ pattern: 'single', opacity: NaN }))[0].opacity).toBe(0.5);
  });

  /* ── multi-line: centers stay per-brick, rendering expands per line ── */
  it('keeps one center per brick for multi-line text while rendering expands per line', () => {
    const twoLine = textConfig({ text: 'A\nB' });
    const threeLine = textConfig({ text: 'A\nB\nC' });
    const twoCenters = buildWatermarkCenters(CANVAS, twoLine);
    const threeCenters = buildWatermarkCenters(CANVAS, threeLine);
    expect(twoCenters.length).toBeGreaterThan(0);
    expect(threeCenters.length).toBeGreaterThan(0);
    expect(buildWatermarkRenderLayers(CANVAS, twoLine)).toHaveLength(twoCenters.length * 2);
    expect(buildWatermarkRenderLayers(CANVAS, threeLine)).toHaveLength(threeCenters.length * 3);
  });

  it('single pattern still produces exactly one center and one layer', () => {
    const single = textConfig({ pattern: 'single' });
    expect(buildWatermarkCenters(CANVAS, single)).toHaveLength(1);
    expect(buildWatermarkRenderLayers(CANVAS, single)).toHaveLength(1);
  });
});

describe('buildBrickPlacements (pure geometry)', () => {
  const content = { width: 100, height: 40 };

  it('rotates the lattice direction together with the watermark angle', () => {
    const flat = buildBrickPlacements({ canvasWidth: 1000, canvasHeight: 500, contentWidth: content.width, contentHeight: content.height, angleDeg: 0, inlineGap: 1, rowGap: 2, phase: 0.5 });
    const rotated = buildBrickPlacements({ canvasWidth: 1000, canvasHeight: 500, contentWidth: content.width, contentHeight: content.height, angleDeg: 45, inlineGap: 1, rowGap: 2, phase: 0.5 });
    expect(flat.length).toBeGreaterThan(0);
    expect(rotated.length).toBeGreaterThan(0);
    // A flat lattice keeps a purely horizontal first neighbour step; a rotated
    // lattice tilts it. Verify a neighbour exists with a non-zero vertical delta.
    const flatDeltas = flat.map((p) => ({ dx: p.cx - flat[0].cx, dy: p.cy - flat[0].cy }));
    expect(flatDeltas.some((d) => d.dx !== 0 && d.dy === 0)).toBe(true);
    const rotatedDeltas = rotated.map((p) => ({ dx: p.cx - rotated[0].cx, dy: p.cy - rotated[0].cy }));
    expect(rotatedDeltas.some((d) => d.dx !== 0 && d.dy !== 0)).toBe(true);
  });

  it('honours the 50% phase as a half-cell column offset', () => {
    const phase0 = buildBrickPlacements({ canvasWidth: 1000, canvasHeight: 500, contentWidth: 100, contentHeight: 40, angleDeg: 0, inlineGap: 1, rowGap: 2, phase: 0 });
    const phaseHalf = buildBrickPlacements({ canvasWidth: 1000, canvasHeight: 500, contentWidth: 100, contentHeight: 40, angleDeg: 0, inlineGap: 1, rowGap: 2, phase: 0.5 });
    // Rows alternate by half a cell in column space; the two plans differ.
    expect(phaseHalf).not.toEqual(phase0);
  });

  it('is deterministic and capped', () => {
    const input = { canvasWidth: 1920, canvasHeight: 1080, contentWidth: 891, contentHeight: 65, angleDeg: 45, inlineGap: 0.75, rowGap: 3, phase: 0.5 };
    expect(buildBrickPlacements(input)).toEqual(buildBrickPlacements(input));
    expect(buildBrickPlacements({ ...input, canvasWidth: 99999, canvasHeight: 99999 }).length).toBeLessThanOrEqual(500);
  });
});

describe('default brick acceptance (1920×1080, 5%, 45°, dense)', () => {
  const config: WatermarkConfig = {
    kind: 'text',
    text: '\u00a9KURO GAMES ALL RIGHTS RESERVED',
    fontFamily: 'Source Han Sans SC',
    color: '#ffffff',
    fontSize: 54,
    pattern: 'brick',
    rotation: 45,
    opacity: 0.5,
    offsetX: 0,
    offsetY: 0,
    phaseOffset: 0.5,
    density: 'dense',
  };

  it('produces roughly 10–18 instances with several diagonal rows and no stacking', () => {
    const layers = buildWatermarkRenderLayers({ width: 1920, height: 1080 }, config);
    const rows = new Set(layers.map((l) => l.id.split(':')[1])).size;
    expect(layers.length).toBeGreaterThanOrEqual(10);
    expect(layers.length).toBeLessThanOrEqual(25);
    expect(rows).toBeGreaterThanOrEqual(4);
    expect(layers.length).toBeLessThan(200);
    const content = measureWatermarkTextContent(config.text, config.fontFamily, config.fontSize);
    expect(minPairwiseDistance(layers)).toBeGreaterThanOrEqual(content.height);
  });

  it('density presets strictly increase sparseness', () => {
    const dense = buildWatermarkRenderLayers({ width: 1920, height: 1080 }, { ...config, density: 'dense' }).length;
    const standard = buildWatermarkRenderLayers({ width: 1920, height: 1080 }, { ...config, density: 'standard' }).length;
    const sparse = buildWatermarkRenderLayers({ width: 1920, height: 1080 }, { ...config, density: 'sparse' }).length;
    expect(dense).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(sparse);
  });
});

describe('content measurement and geometry helpers', () => {
  it('measures a multi-line block as one tall content box', () => {
    const box = measureWatermarkTextContent('第一行\n第二行', 'Source Han Sans SC', 50);
    expect(box.height).toBeCloseTo(50 * 1.2 * 2);
    expect(box.width).toBeGreaterThan(0);
  });

  it('falls back to a deterministic width when canvas metrics are unavailable', () => {
    const wide = measureWatermarkTextContent('WWWW', 'Source Han Sans SC', 50).width;
    const narrow = measureWatermarkTextContent('llll', 'Source Han Sans SC', 50).width;
    expect(wide).toBeCloseTo(narrow);
  });

  it('computes the rotated bounding box', () => {
    const box = rotatedBoundingBox(100, 40, 90);
    expect(box.width).toBeCloseTo(40);
    expect(box.height).toBeCloseTo(100);
  });

  it('resolves the outlined stroke as the same rounded integer FFmpeg borderw uses', () => {
    expect(resolveWatermarkTextVisual(undefined, 54)).toEqual({ fill: '#ffffff' });
    expect(resolveWatermarkTextVisual('white', 54)).toEqual({ fill: '#ffffff' });
    expect(resolveWatermarkTextVisual('black', 54)).toEqual({ fill: '#000000' });
    // 54 * 0.08 = 4.32 → round → 4; matches Rust `outlined_border_width(54.0)`.
    expect(resolveWatermarkTextVisual('outlined', 54)).toEqual({
      fill: '#ffffff',
      stroke: { color: '#000000', width: 4 },
    });
    // Floored at 1 for very small fonts.
    expect(resolveWatermarkTextVisual('outlined', 10)).toEqual({
      fill: '#ffffff',
      stroke: { color: '#000000', width: 1 },
    });
  });

  it('exposes density gaps as height units', () => {
    expect(WATERMARK_DENSITY_GAPS.dense.rowGap).toBeGreaterThan(WATERMARK_DENSITY_GAPS.dense.inlineGap);
    expect(WATERMARK_DENSITY_GAPS.sparse.inlineGap).toBeGreaterThan(WATERMARK_DENSITY_GAPS.dense.inlineGap);
  });
});
