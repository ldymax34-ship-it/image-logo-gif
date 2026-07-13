import {
  type BrandAnchor,
  type BrandSizeLevel,
  type CanvasSize,
  type LayoutProfile,
  type LayoutRect,
  DEFAULT_LAYOUT_PROFILE,
  clamp,
  computeMargin,
  getFamilyRule,
  getShortSide,
  fitRectInsideCanvas
} from './layoutProfile';

export type CprLayoutInput = {
  canvas: CanvasSize;
  anchor?: BrandAnchor;
  svgAspectRatio?: number;
  profile?: LayoutProfile;
  color?: string;
};

export type CprLayoutResult = {
  rect: LayoutRect;
  anchor: BrandAnchor;
  widthPx: number;
  marginPx: number;
  color: string;
};

export function computeCprWidth(canvas: CanvasSize, profile: LayoutProfile = DEFAULT_LAYOUT_PROFILE): number {
  const rule = getFamilyRule(canvas, profile);
  const base = getShortSide(canvas) * rule.cprWidthRatio;
  return Math.round(clamp(base, rule.cprMinWidth, rule.cprMaxWidth));
}

export function computeCprLayout(input: CprLayoutInput): CprLayoutResult {
  const profile = input.profile ?? DEFAULT_LAYOUT_PROFILE;
  const rule = getFamilyRule(input.canvas, profile);
  // CPR is a bottom-fixed brand component. The legacy anchor only determines
  // left/center/right alignment; it never controls the vertical coordinate.
  const anchor = input.anchor ?? 'center';
  const widthPx = computeCprWidth(input.canvas, profile);
  const aspect = Number.isFinite(input.svgAspectRatio) && Number(input.svgAspectRatio) > 0 ? Number(input.svgAspectRatio) : 4;
  const heightPx = Math.max(1, Math.round(widthPx / aspect));
  const marginPx = computeMargin(input.canvas, profile);
  const x = anchor === 'top-left'
    ? marginPx
    : anchor === 'top-right'
      ? input.canvas.width - marginPx - widthPx
      : (input.canvas.width - widthPx) / 2;
  return {
    rect: fitRectInsideCanvas({ x, y: input.canvas.height - marginPx - heightPx, width: widthPx, height: heightPx }, input.canvas),
    anchor,
    widthPx,
    marginPx,
    color: input.color ?? '#ffffff'
  };
}
