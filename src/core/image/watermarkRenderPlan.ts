/* ── Watermark config: parameterized production rule, not an editor ── */

export type WatermarkPattern = 'single' | 'brick' | 'tiled' | 'staggered';
export type WatermarkDensity = 'dense' | 'standard' | 'sparse';

export type WatermarkTextContent = {
  kind: 'text';
  text: string;
  fontFamily: string;
  color: string;
  fontSize: number;
};

export type WatermarkImageContent = {
  kind: 'image';
  src: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  displayWidth: number;
};

/**
 * The single production contract consumed by image preview, image export,
 * video canvas preview and video FFmpeg placements.
 *
 * Spacing is no longer a "center step". Brick layout is driven by a density
 * preset (or explicit `inlineGap` / `rowGap` overrides, both expressed in
 * units of the watermark height `h`). Rows/columns are always derived from
 * the canvas and content box — never persisted as a second source of truth.
 */
export type WatermarkConfig = (WatermarkTextContent | WatermarkImageContent) & {
  pattern: WatermarkPattern;
  rotation: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
  phaseOffset?: number;
  density?: WatermarkDensity;
  inlineGap?: number;
  rowGap?: number;
};

/* ── Expanded instance (deterministic, no persisted state) ── */

type WatermarkInstanceBase = {
  id: string;
  cx: number;
  cy: number;
  rotation: number;
  opacity: number;
};

export type WatermarkTextLayerInstance = WatermarkInstanceBase & WatermarkTextContent;
export type WatermarkImageLayerInstance = WatermarkInstanceBase & {
  kind: 'image';
  src: string;
  width: number;
  height: number;
};
export type WatermarkLayerInstance = WatermarkTextLayerInstance | WatermarkImageLayerInstance;

/* ── Constants ── */

const MAX_INSTANCES = 500;

/* ── Density → gap mapping (gaps are units of the watermark height h) ── */

/**
 * Density presets expressed as gaps in units of the watermark height `h`
 * (the prep-doc contract). With the center-inside brick filter, `dense` keeps
 * the default long copyright text (`©KURO GAMES ALL RIGHTS RESERVED` at 5% on
 * 1920×1080) at ≈15 in-canvas instances across ≈11 diagonal lattice rows —
 * inside the 10–18 acceptance band and far from the previous 200+ stacking.
 */
export const WATERMARK_DENSITY_GAPS: Record<WatermarkDensity, { inlineGap: number; rowGap: number }> = {
  dense: { inlineGap: 0.75, rowGap: 1.0 },
  standard: { inlineGap: 1.5, rowGap: 1.75 },
  sparse: { inlineGap: 2.5, rowGap: 2.75 },
};

/* ── Input sanitisation ── */

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  const f = finiteOr(value, 0.5);
  return Math.max(0, Math.min(1, f));
}

function clampOpacity(v: number): number {
  const f = finiteOr(v, 0.5);
  return Math.max(0, Math.min(1, f));
}

function clampGap(v: number, fallback: number): number {
  const f = finiteOr(v, fallback);
  return Math.max(0, f);
}

function positiveFinite(value: number, fallback: number): number {
  const normalized = finiteOr(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

/* ── Content measurement (DOM/Canvas layer, isolated from pure geometry) ── */

export type WatermarkContentBox = { width: number; height: number };

let sharedMeasureContext: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (sharedMeasureContext === undefined) {
    sharedMeasureContext = null;
    try {
      if (typeof document !== 'undefined') {
        sharedMeasureContext = document.createElement('canvas').getContext('2d');
      } else if (typeof OffscreenCanvas !== 'undefined') {
        sharedMeasureContext = new OffscreenCanvas(1, 1).getContext('2d') as CanvasRenderingContext2D | null;
      }
    } catch {
      sharedMeasureContext = null;
    }
  }
  return sharedMeasureContext;
}

/** Deterministic width estimate used when Canvas text metrics are unavailable. */
function estimateLineWidth(line: string, fontSize: number): number {
  let units = 0;
  for (const character of line) {
    if (/\s/.test(character)) units += 0.3;
    else if (character.charCodeAt(0) <= 0x7f) units += 0.55;
    else units += 1.0;
  }
  return Math.max(1, units) * fontSize;
}

/**
 * Measures the unrotated content box of a text watermark (max line width ×
 * total line height). Multi-line text forms one block, never one brick per line.
 */
export function measureWatermarkTextContent(
  text: string,
  fontFamily: string,
  fontSize: number,
): WatermarkContentBox {
  const safeFontSize = Math.max(1, finiteOr(fontSize, 16));
  const lines = text.split('\n');
  const lineHeight = safeFontSize * 1.2;
  const context = getMeasureContext();
  let width = 0;
  if (context) {
    context.font = `500 ${safeFontSize}px ${fontFamily}`;
    for (const line of lines) {
      width = Math.max(width, context.measureText(line).width);
    }
  }
  if (width <= 0) {
    for (const line of lines) {
      width = Math.max(width, estimateLineWidth(line, safeFontSize));
    }
  }
  return { width: Math.max(1, width), height: Math.max(1, lines.length * lineHeight) };
}

/* ── Pure brick placement geometry (no DOM / FFmpeg / remote deps) ── */

export type BrickPlacement = { row: number; column: number; cx: number; cy: number };

export type BrickPlacementInput = {
  canvasWidth: number;
  canvasHeight: number;
  contentWidth: number;
  contentHeight: number;
  angleDeg: number;
  inlineGap: number;
  rowGap: number;
  phase: number;
  offsetX?: number;
  offsetY?: number;
};

/**
 * Builds a true brick lattice whose basis vectors rotate together with the
 * watermark direction:
 *
 *   A = Rotate(angle) × (cellWidth, 0)
 *   B = Rotate(angle) × (phase × cellWidth, rowStep)
 *   position(row, column) = origin + column × A + row × B
 *
 * `cellWidth = contentWidth + inlineGap × h` and
 * `rowStep = contentHeight + rowGap × h`, with `h = contentHeight`.
 * Rows and columns are derived from canvas coverage and capped, never stored.
 */
export function buildBrickPlacements(input: BrickPlacementInput): BrickPlacement[] {
  const cw = finiteOr(input.canvasWidth, 0);
  const ch = finiteOr(input.canvasHeight, 0);
  if (cw <= 0 || ch <= 0) return [];
  const contentWidth = Math.max(1, finiteOr(input.contentWidth, 1));
  const contentHeight = Math.max(1, finiteOr(input.contentHeight, 1));
  const h = contentHeight;
  const angle = (finiteOr(input.angleDeg, 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const inlineGap = clampGap(input.inlineGap, WATERMARK_DENSITY_GAPS.dense.inlineGap);
  const rowGap = clampGap(input.rowGap, WATERMARK_DENSITY_GAPS.dense.rowGap);
  const phase = clamp01(input.phase);
  const cellWidth = contentWidth + inlineGap * h;
  const rowStep = contentHeight + rowGap * h;

  const ax = cellWidth * cos;
  const ay = cellWidth * sin;
  const bx = phase * cellWidth * cos - rowStep * sin;
  const by = phase * cellWidth * sin + rowStep * cos;

  const originX = cw / 2 + finiteOr(input.offsetX ?? 0, 0);
  const originY = ch / 2 + finiteOr(input.offsetY ?? 0, 0);

  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-9) return [];

  // Inverse-transform the canvas corners into lattice coordinates to bound the
  // row/column range, then widen by the content footprint.
  const corners: Array<[number, number]> = [[0, 0], [cw, 0], [cw, ch], [0, ch]];
  let cMin = Infinity;
  let cMax = -Infinity;
  let rMin = Infinity;
  let rMax = -Infinity;
  for (const [px, py] of corners) {
    const column = (by * (px - originX) - bx * (py - originY)) / det;
    const row = (-ay * (px - originX) + ax * (py - originY)) / det;
    cMin = Math.min(cMin, column);
    cMax = Math.max(cMax, column);
    rMin = Math.min(rMin, row);
    rMax = Math.max(rMax, row);
  }
  // A one-cell margin on each side keeps the index window wide enough that no
  // in-canvas center is missed by floating-point rounding. Instances are
  // included when their center falls inside the canvas; instances near the
  // border are naturally clipped by the renderer, which keeps the visible
  // count bounded (≈10–18 for the default long copyright text) instead of
  // inflating it with strips that only graze a corner.
  const colStart = Math.floor(cMin) - 1;
  const colEnd = Math.ceil(cMax) + 1;
  const rowStart = Math.floor(rMin) - 1;
  const rowEnd = Math.ceil(rMax) + 1;

  const placements: BrickPlacement[] = [];
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let column = colStart; column <= colEnd; column += 1) {
      const cx = originX + column * ax + row * bx;
      const cy = originY + column * ay + row * by;
      if (cx < 0 || cx > cw || cy < 0 || cy > ch) continue;
      placements.push({ row, column, cx, cy });
      if (placements.length >= MAX_INSTANCES) return placements;
    }
  }
  return placements;
}

/** Axis-aligned bounding box of a `width × height` box rotated by `angleDeg`. */
export function rotatedBoundingBox(
  width: number,
  height: number,
  angleDeg: number,
): { width: number; height: number } {
  const radians = (finiteOr(angleDeg, 0) * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width: width * cosine + height * sine,
    height: width * sine + height * cosine,
  };
}

/* ── Pure builder ── */

function contentBoxForConfig(config: WatermarkConfig): WatermarkContentBox {
  if (config.kind === 'text') {
    return measureWatermarkTextContent(config.text, config.fontFamily, positiveFinite(config.fontSize, 16));
  }
  const width = positiveFinite(config.displayWidth, 1);
  const intrinsicWidth = positiveFinite(config.intrinsicWidth, 1);
  const intrinsicHeight = positiveFinite(config.intrinsicHeight, intrinsicWidth);
  return { width, height: width * (intrinsicHeight / intrinsicWidth) };
}

function resolveGaps(config: WatermarkConfig): { inlineGap: number; rowGap: number } {
  const preset = WATERMARK_DENSITY_GAPS[config.density ?? 'dense'] ?? WATERMARK_DENSITY_GAPS.dense;
  return {
    inlineGap: clampGap(config.inlineGap ?? preset.inlineGap, preset.inlineGap),
    rowGap: clampGap(config.rowGap ?? preset.rowGap, preset.rowGap),
  };
}

/**
 * Pure brick-center plan: exactly one center per brick (or the single anchor),
 * independent of whether the watermark content is a single line or a multi-line
 * block. Image rendering expands each center into per-line draw layers, while
 * FFmpeg placements must stay one-per-center — both consume this single source
 * of truth so line count never re-introduces a second truth.
 */
export function buildWatermarkCenters(
  canvasSize: { width: number; height: number },
  config: WatermarkConfig,
): BrickPlacement[] {
  const cw = finiteOr(canvasSize.width, 0);
  const ch = finiteOr(canvasSize.height, 0);
  if (cw <= 0 || ch <= 0) return [];

  const isSingle = config.pattern === 'single';
  const cx0 = cw / 2 + finiteOr(config.offsetX, 0);
  const cy0 = ch / 2 + finiteOr(config.offsetY, 0);
  if (isSingle) return [{ row: 0, column: 0, cx: cx0, cy: cy0 }];

  // Brick: `brick` and legacy `staggered` default to 50% phase; legacy `tiled`
  // keeps a zero phase so the old "规则平铺" semantics remain expressible.
  const phase = config.pattern === 'tiled' ? 0 : finiteOr(config.phaseOffset ?? 0.5, 0.5);
  const content = contentBoxForConfig(config);
  const gaps = resolveGaps(config);
  return buildBrickPlacements({
    canvasWidth: cw,
    canvasHeight: ch,
    contentWidth: content.width,
    contentHeight: content.height,
    angleDeg: finiteOr(config.rotation, 0),
    inlineGap: gaps.inlineGap,
    rowGap: gaps.rowGap,
    phase,
    offsetX: finiteOr(config.offsetX, 0),
    offsetY: finiteOr(config.offsetY, 0),
  });
}

export function buildWatermarkRenderLayers(
  canvasSize: { width: number; height: number },
  config: WatermarkConfig,
): WatermarkLayerInstance[] {
  const cw = finiteOr(canvasSize.width, 0);
  const ch = finiteOr(canvasSize.height, 0);
  if (cw <= 0 || ch <= 0) return [];

  const rotation = finiteOr(config.rotation, 0);
  const opacity = clampOpacity(config.opacity);

  const base = { rotation, opacity };
  const makeInstance = (id: string, cx: number, cy: number): WatermarkLayerInstance | WatermarkLayerInstance[] => {
    if (config.kind === 'text') {
      const fontSize = positiveFinite(config.fontSize, 16);
      if (!config.text.includes('\n')) {
        return {
          id,
          cx,
          cy,
          ...base,
          kind: 'text',
          text: config.text,
          fontFamily: config.fontFamily,
          color: config.color,
          fontSize,
        };
      }
      const lineHeight = fontSize * 1.2;
      const lines = config.text.split('\n');
      const totalHeight = lines.length * lineHeight;
      const startY = cy - totalHeight / 2 + lineHeight / 2;
      return lines.map((line, li) => ({
        id: `${id}:L${li}`,
        cx,
        cy: startY + li * lineHeight,
        ...base,
        kind: 'text' as const,
        text: line,
        fontFamily: config.fontFamily,
        color: config.color,
        fontSize,
      }));
    }
    const width = positiveFinite(config.displayWidth, 1);
    const intrinsicWidth = positiveFinite(config.intrinsicWidth, 1);
    const intrinsicHeight = positiveFinite(config.intrinsicHeight, intrinsicWidth);
    return {
      id,
      cx,
      cy,
      ...base,
      kind: 'image',
      src: config.src,
      width,
      height: width * (intrinsicHeight / intrinsicWidth),
    };
  };

  const instances: WatermarkLayerInstance[] = [];
  for (const center of buildWatermarkCenters(canvasSize, config)) {
    const sub = makeInstance(`wm:${center.row}:${center.column}`, center.cx, center.cy);
    const remaining = MAX_INSTANCES - instances.length;
    if (remaining <= 0) break;
    if (Array.isArray(sub)) instances.push(...sub.slice(0, remaining));
    else instances.push(sub);
  }
  return instances;
}
