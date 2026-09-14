export type AspectFamily = 'landscape' | 'square' | 'portrait';
export type BrandAnchor = 'top-left' | 'top-right' | 'center';
export type BrandSizeLevel = 'small' | 'standard' | 'large' | 'xl' | 'xxl';

export type CanvasSize = {
  width: number;
  height: number;
};

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FamilyLayoutRule = {
  logoWidthRatio: number;
  logoMinWidth: number;
  logoMaxWidth: number;
  marginRatio: number;
  marginMin: number;
  marginMax: number;
  cprWidthRatio: number;
  cprMinWidth: number;
  cprMaxWidth: number;
  cprFontSizeRatio: number;
  cprShadowBlurRatio: number;
};

export type LayoutProfile = Record<AspectFamily, FamilyLayoutRule>;

export const DEFAULT_LAYOUT_PROFILE: LayoutProfile = {
  landscape: {
    logoWidthRatio: 0.16,
    logoMinWidth: 120,
    logoMaxWidth: 220,
    marginRatio: 0.04,
    marginMin: 32,
    marginMax: 96,
    cprWidthRatio: 0.24,
    cprMinWidth: 160,
    cprMaxWidth: 320,
    cprFontSizeRatio: 0.028,
    cprShadowBlurRatio: 0.012
  },
  square: {
    logoWidthRatio: 0.18,
    logoMinWidth: 120,
    logoMaxWidth: 210,
    marginRatio: 0.045,
    marginMin: 30,
    marginMax: 88,
    cprWidthRatio: 0.28,
    cprMinWidth: 160,
    cprMaxWidth: 300,
    cprFontSizeRatio: 0.032,
    cprShadowBlurRatio: 0.014
  },
  portrait: {
    logoWidthRatio: 0.2,
    logoMinWidth: 120,
    logoMaxWidth: 240,
    marginRatio: 0.04,
    marginMin: 28,
    marginMax: 90,
    cprWidthRatio: 0.3,
    cprMinWidth: 150,
    cprMaxWidth: 310,
    cprFontSizeRatio: 0.034,
    cprShadowBlurRatio: 0.015
  }
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function assertCanvasSize(canvas: CanvasSize): CanvasSize {
  const width = Math.round(Number(canvas.width));
  const height = Math.round(Number(canvas.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid canvas size: ${canvas.width}x${canvas.height}`);
  }
  return { width, height };
}

export function getShortSide(canvas: CanvasSize): number {
  const normalized = assertCanvasSize(canvas);
  return Math.min(normalized.width, normalized.height);
}

export function classifyAspect(canvas: CanvasSize): AspectFamily {
  const { width, height } = assertCanvasSize(canvas);
  const aspect = width / height;
  if (aspect >= 1.25) return 'landscape';
  if (aspect >= 0.85) return 'square';
  return 'portrait';
}

export function getFamilyRule(canvas: CanvasSize, profile: LayoutProfile = DEFAULT_LAYOUT_PROFILE): FamilyLayoutRule {
  return profile[classifyAspect(canvas)];
}

export function getSizeLevelMultiplier(sizeLevel: BrandSizeLevel = 'standard'): number {
  if (sizeLevel === 'small') return 0.85;
  if (sizeLevel === 'large') return 1.15;
  if (sizeLevel === 'xl') return 1.45;
  if (sizeLevel === 'xxl') return 2;
  return 1;
}

export function computeMargin(canvas: CanvasSize, profile: LayoutProfile = DEFAULT_LAYOUT_PROFILE): number {
  const rule = getFamilyRule(canvas, profile);
  return Math.round(clamp(getShortSide(canvas) * rule.marginRatio, rule.marginMin, rule.marginMax));
}

export function fitRectInsideCanvas(rect: LayoutRect, canvas: CanvasSize): LayoutRect {
  const normalized = assertCanvasSize(canvas);
  const width = Math.min(rect.width, normalized.width);
  const height = Math.min(rect.height, normalized.height);
  return {
    x: clamp(rect.x, 0, normalized.width - width),
    y: clamp(rect.y, 0, normalized.height - height),
    width,
    height
  };
}

export function placeAnchoredRect(
  canvas: CanvasSize,
  rectSize: Pick<LayoutRect, 'width' | 'height'>,
  anchor: BrandAnchor,
  margin: number
): LayoutRect {
  const normalized = assertCanvasSize(canvas);
  const width = Math.round(rectSize.width);
  const height = Math.round(rectSize.height);
  if (anchor === 'top-right') {
    return fitRectInsideCanvas({ x: normalized.width - margin - width, y: margin, width, height }, normalized);
  }
  if (anchor === 'center') {
    return fitRectInsideCanvas(
      { x: (normalized.width - width) / 2, y: (normalized.height - height) / 2, width, height },
      normalized
    );
  }
  return fitRectInsideCanvas({ x: margin, y: margin, width, height }, normalized);
}
