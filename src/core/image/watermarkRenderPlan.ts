import type { MaterialAsset } from './imageMeta';

/* ── Watermark config: parameterized production rule, not an editor ── */

export type WatermarkPattern = 'single' | 'tiled';

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

export type WatermarkConfig = (WatermarkTextContent | WatermarkImageContent) & {
  pattern: WatermarkPattern;
  rotation: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
  spacingX: number;
  spacingY: number;
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
const MIN_SPACING = 20;

/* ── Input sanitisation ── */

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampOpacity(v: number): number {
  const f = finiteOr(v, 0.5);
  return Math.max(0, Math.min(1, f));
}

function clampSpacing(v: number): number {
  const f = finiteOr(v, MIN_SPACING);
  return Math.max(MIN_SPACING, f);
}

function normalizeOffset(value: number, period: number): number {
  const offset = finiteOr(value, 0);
  if (period <= 0) return offset;
  return ((offset + period / 2) % period + period) % period - period / 2;
}

function positiveFinite(value: number, fallback: number): number {
  const normalized = finiteOr(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

/* ── Pure builder ── */

export function buildWatermarkRenderLayers(
  canvasSize: { width: number; height: number },
  config: WatermarkConfig,
): WatermarkLayerInstance[] {
  const cw = finiteOr(canvasSize.width, 0);
  const ch = finiteOr(canvasSize.height, 0);
  if (cw <= 0 || ch <= 0) return [];

  const rawSpacingX = clampSpacing(config.spacingX);
  const rawSpacingY = clampSpacing(config.spacingY);
  const cx0 = cw / 2 + (config.pattern === 'tiled' ? normalizeOffset(config.offsetX, rawSpacingX) : finiteOr(config.offsetX, 0));
  const cy0 = ch / 2 + (config.pattern === 'tiled' ? normalizeOffset(config.offsetY, rawSpacingY) : finiteOr(config.offsetY, 0));
  const rotation = finiteOr(config.rotation, 0);
  const opacity = clampOpacity(config.opacity);

  // Content fields shared by every instance
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
      height: width * (intrinsicHeight / intrinsicWidth)
    };
  };

  if (config.pattern === 'single') {
    const result = makeInstance('wm:0:0', cx0, cy0);
    return (Array.isArray(result) ? result : [result]).slice(0, MAX_INSTANCES);
  }

  // Tiled: independently overscan both axes by the diagonal plus one cell.
  // A shared max spacing is not safe for extreme asymmetric input.
  const diagonal = Math.sqrt(cw ** 2 + ch ** 2);
  let spacingX = rawSpacingX;
  let spacingY = rawSpacingY;
  const dimensions = () => {
    const halfX = diagonal / 2 + spacingX;
    const halfY = diagonal / 2 + spacingY;
    // The endpoint gives (last - first) >= 2 * halfAxis.
    return {
      cols: Math.max(2, Math.ceil((halfX * 2) / spacingX) + 1),
      rows: Math.max(2, Math.ceil((halfY * 2) / spacingY) + 1),
    };
  };
  let { cols, rows } = dimensions();
  // If over budget, enlarge both spacings and recompute the ceil dimensions.
  // Never shorten cols/rows directly: that would shrink the symmetric grid
  // span and can leave a rotated canvas uncovered at its edges.
  for (let iteration = 0; cols * rows > MAX_INSTANCES && iteration < 64; iteration += 1) {
    const scale = Math.sqrt((cols * rows) / MAX_INSTANCES) * 1.001;
    spacingX *= scale;
    spacingY *= scale;
    ({ cols, rows } = dimensions());
  }
  if (cols * rows > MAX_INSTANCES) {
    // Safety fallback still expands spacing and recomputes endpoints; it never
    // clips a grid and therefore cannot trade away coverage for the cap.
    spacingX = Math.max(spacingX, diagonal);
    spacingY = Math.max(spacingY, diagonal);
    ({ cols, rows } = dimensions());
  }

  // Center the grid so coverage is symmetric around (cx0, cy0).
  const startX = cx0 - ((cols - 1) * spacingX) / 2;
  const startY = cy0 - ((rows - 1) * spacingY) / 2;

  const instances: WatermarkLayerInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sub = makeInstance(`wm:${r}:${c}`, startX + c * spacingX, startY + r * spacingY);
      const remaining = MAX_INSTANCES - instances.length;
      if (remaining <= 0) return instances;
      if (Array.isArray(sub)) instances.push(...sub.slice(0, remaining));
      else instances.push(sub);
    }
  }
  return instances;
}

/* ── Adapter: WatermarkState → WatermarkConfig ── */

export type WatermarkStateAdapter = {
  kind: 'text' | 'image';
  pattern: 'single' | 'tiled' | 'diagonal';
  text: string;
  fontFamily: string;
  color: string;
  scale: number;
  rotation: number;
  opacity: number;
  x: number;
  y: number;
  density: 'low' | 'medium' | 'high';
  spacingX?: number;
  spacingY?: number;
  imagePath?: string;
  imageAsset?: MaterialAsset;
};

const DENSITY_SPACING: Record<'low' | 'medium' | 'high', { x: number; y: number }> = {
  low: { x: 320, y: 240 },
  medium: { x: 220, y: 160 },
  high: { x: 140, y: 100 },
};

export function adaptWatermarkConfig(
  canvasSize: { width: number; height: number },
  state: WatermarkStateAdapter,
): WatermarkConfig | undefined {
  const cw = finiteOr(canvasSize.width, 0);
  const ch = finiteOr(canvasSize.height, 0);
  if (cw <= 0 || ch <= 0) return undefined;

  const pattern: WatermarkPattern = state.pattern === 'single' ? 'single' : 'tiled';
  const spacing = DENSITY_SPACING[state.density] ?? DENSITY_SPACING.medium;
  const spacingX = state.spacingX ?? spacing.x;
  const spacingY = state.spacingY ?? spacing.y;

  const common = {
    pattern,
    rotation: finiteOr(state.rotation, 0),
    opacity: clampOpacity(state.opacity),
    offsetX: finiteOr(state.x, 0),
    offsetY: finiteOr(state.y, 0),
    spacingX,
    spacingY,
  };

  if (state.kind === 'text') {
    const fontSize = Math.max(16, Math.min(cw, ch) * 0.05 * finiteOr(state.scale, 1));
    return { kind: 'text', text: state.text, fontFamily: state.fontFamily, color: state.color, fontSize, ...common };
  }

  if (state.imageAsset) {
    const displayWidth = cw * finiteOr(state.scale, 1) * 0.25;
    return {
      kind: 'image',
      src: state.imageAsset.objectUrl,
      intrinsicWidth: state.imageAsset.width,
      intrinsicHeight: state.imageAsset.height,
      displayWidth,
      ...common,
    };
  }

  return undefined;
}
