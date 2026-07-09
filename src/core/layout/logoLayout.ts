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

export type LogoLayoutInput = {
  canvas: CanvasSize;
  anchor?: BrandAnchor;
  sizeLevel?: BrandSizeLevel;
  svgAspectRatio?: number;
  profile?: LayoutProfile;
};

export type LogoLayoutResult = {
  rect: LayoutRect;
  anchor: BrandAnchor;
  widthPx: number;
  marginPx: number;
};

export function computeLogoWidth(
  canvas: CanvasSize,
  sizeLevel: BrandSizeLevel = 'standard',
  profile: LayoutProfile = DEFAULT_LAYOUT_PROFILE
): number {
  const rule = getFamilyRule(canvas, profile);
  const base = getShortSide(canvas) * rule.logoWidthRatio * getSizeLevelMultiplier(sizeLevel);
  return Math.round(clamp(base, rule.logoMinWidth, rule.logoMaxWidth));
}

export function computeLogoLayout(input: LogoLayoutInput): LogoLayoutResult {
  const profile = input.profile ?? DEFAULT_LAYOUT_PROFILE;
  const anchor = input.anchor ?? 'top-right';
  const widthPx = computeLogoWidth(input.canvas, input.sizeLevel, profile);
  const aspect = Number.isFinite(input.svgAspectRatio) && Number(input.svgAspectRatio) > 0 ? Number(input.svgAspectRatio) : 3;
  const heightPx = Math.max(1, Math.round(widthPx / aspect));
  const marginPx = computeMargin(input.canvas, profile);
  return {
    rect: placeAnchoredRect(input.canvas, { width: widthPx, height: heightPx }, anchor, marginPx),
    anchor,
    widthPx,
    marginPx
  };
}
