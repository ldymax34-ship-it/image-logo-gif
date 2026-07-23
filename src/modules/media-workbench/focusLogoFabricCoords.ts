import { getLogoPlacementBounds, type LogoConstraintMode } from '../../core';

export type FocusLogoCanvasRect = { x: number; y: number; width: number; height: number };

export type FocusLogoFabricFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
};

export type FocusLogoTransform = { x: number; y: number; scale: number };

export type FocusLogoTransformBaseline = {
  rect: FocusLogoCanvasRect;
  currentScale: number;
  minScale: number;
  maxScale: number;
  canvas: { width: number; height: number };
  constraintMode: LogoConstraintMode;
  previewScale: number;
};

const MIN_LOGO_SCALE = .5;
const MAX_LOGO_SCALE = 2;

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Maps the current Render Plan group rect to Fabric's CSS-pixel space. */
export function toFocusLogoFabricFrame(rect: FocusLogoCanvasRect, previewScale: number): FocusLogoFabricFrame {
  const scale = Math.max(Number.EPSILON, finite(previewScale, 1));
  return {
    left: rect.x * scale,
    top: rect.y * scale,
    width: Math.max(1, rect.width) * scale,
    height: Math.max(1, rect.height) * scale,
    scaleX: 1,
    scaleY: 1
  };
}

/** Freezes the render geometry so one Fabric gesture cannot accumulate React updates. */
export function createFocusLogoTransformBaseline(
  rect: FocusLogoCanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  constraintMode: LogoConstraintMode,
  previewScale: number
): FocusLogoTransformBaseline {
  const resolvedScale = clamp(finite(currentScale, 1), MIN_LOGO_SCALE, MAX_LOGO_SCALE);
  const baseWidth = Math.max(Number.EPSILON, rect.width / resolvedScale);
  const baseHeight = Math.max(Number.EPSILON, rect.height / resolvedScale);
  const emptyBounds = getLogoPlacementBounds(canvas, { width: 0, height: 0 }, constraintMode);
  const availableWidth = Math.max(0, emptyBounds.maxX - emptyBounds.minX);
  const availableHeight = Math.max(0, emptyBounds.maxY - emptyBounds.minY);
  const geometricMax = Math.min(
    availableWidth / baseWidth,
    availableHeight / baseHeight
  );
  const maxScale = Math.max(MIN_LOGO_SCALE, Math.min(MAX_LOGO_SCALE, geometricMax));

  return {
    rect: { ...rect },
    currentScale: resolvedScale,
    minScale: Math.min(MIN_LOGO_SCALE, maxScale),
    maxScale,
    canvas: { ...canvas },
    constraintMode,
    previewScale: Math.max(Number.EPSILON, finite(previewScale, 1))
  };
}

/** Converts a Fabric move / uniform corner scale to existing Logo state. */
export function fromFocusLogoFabricFrame(
  frame: FocusLogoFabricFrame,
  baseline: FocusLogoTransformBaseline
): FocusLogoTransform {
  const scaleMultiplier = Math.max(Number.EPSILON, Math.abs(finite(frame.scaleX, 1)));
  const scale = clamp(baseline.currentScale * scaleMultiplier, baseline.minScale, baseline.maxScale);
  const appliedMultiplier = scale / baseline.currentScale;
  const rect = {
    width: baseline.rect.width * appliedMultiplier,
    height: baseline.rect.height * appliedMultiplier
  };
  const bounds = getLogoPlacementBounds(baseline.canvas, rect, baseline.constraintMode);

  return {
    x: clamp(finite(frame.left) / baseline.previewScale, bounds.minX, bounds.maxX),
    y: clamp(finite(frame.top) / baseline.previewScale, bounds.minY, bounds.maxY),
    scale
  };
}

/** Restores the constrained domain state to Fabric's baseline frame. */
export function toConstrainedFocusLogoFabricFrame(
  transform: FocusLogoTransform,
  baseline: FocusLogoTransformBaseline
): FocusLogoFabricFrame {
  return {
    left: transform.x * baseline.previewScale,
    top: transform.y * baseline.previewScale,
    width: baseline.rect.width * baseline.previewScale,
    height: baseline.rect.height * baseline.previewScale,
    scaleX: transform.scale / baseline.currentScale,
    scaleY: transform.scale / baseline.currentScale
  };
}
