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
  getSizeLevelMultiplier,
  placeAnchoredRect
} from './layoutProfile';

export type CprShadow = {
  color: string;
  opacity: number;
  blurPx: number;
  offsetX: number;
  offsetY: number;
};

export type CprLayoutInput = {
  canvas: CanvasSize;
  anchor?: BrandAnchor;
  sizeLevel?: BrandSizeLevel;
  svgAspectRatio?: number;
  profile?: LayoutProfile;
  color?: string;
  shadowColor?: string;
};

export type CprLayoutResult = {
  rect: LayoutRect;
  anchor: BrandAnchor;
  widthPx: number;
  marginPx: number;
  fontSizePx: number;
  shadow: CprShadow;
  color: string;
};

export function computeCprWidth(
  canvas: CanvasSize,
  sizeLevel: BrandSizeLevel = 'standard',
  profile: LayoutProfile = DEFAULT_LAYOUT_PROFILE
): number {
  const rule = getFamilyRule(canvas, profile);
  const base = getShortSide(canvas) * rule.cprWidthRatio * getSizeLevelMultiplier(sizeLevel);
  return Math.round(clamp(base, rule.cprMinWidth, rule.cprMaxWidth));
}

export function computeCprLayout(input: CprLayoutInput): CprLayoutResult {
  const profile = input.profile ?? DEFAULT_LAYOUT_PROFILE;
  const rule = getFamilyRule(input.canvas, profile);
  const anchor = input.anchor ?? 'center';
  const widthPx = computeCprWidth(input.canvas, input.sizeLevel, profile);
  const aspect = Number.isFinite(input.svgAspectRatio) && Number(input.svgAspectRatio) > 0 ? Number(input.svgAspectRatio) : 4;
  const heightPx = Math.max(1, Math.round(widthPx / aspect));
  const marginPx = computeMargin(input.canvas, profile);
  const shortSide = getShortSide(input.canvas);
  return {
    rect: placeAnchoredRect(input.canvas, { width: widthPx, height: heightPx }, anchor, marginPx),
    anchor,
    widthPx,
    marginPx,
    fontSizePx: Math.round(clamp(shortSide * rule.cprFontSizeRatio, 14, 64)),
    color: input.color ?? '#ffffff',
    shadow: {
      color: input.shadowColor ?? '#000000',
      opacity: 0.45,
      blurPx: Math.round(clamp(shortSide * rule.cprShadowBlurRatio, 8, 40)),
      offsetX: 0,
      offsetY: Math.round(clamp(shortSide * 0.004, 2, 10))
    }
  };
}
