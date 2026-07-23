import { getLogoPlacementBounds, type LogoConstraintMode } from '../../core';
import {
  fromFabricFrame,
  toFabricFrame,
  toFabricFrameFromTransform,
  type CanvasRect,
  type FabricFrame
} from '../../components/canvas/fabricInteraction';

export type FocusLogoCanvasRect = CanvasRect;
export type FocusLogoFabricFrame = FabricFrame;

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
export const toFocusLogoFabricFrame = toFabricFrame;

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
  return fromFabricFrame(frame, baseline, (scale) => {
    const multiplier = scale / baseline.currentScale;
    const bounds = getLogoPlacementBounds(baseline.canvas, {
      width: baseline.rect.width * multiplier,
      height: baseline.rect.height * multiplier
    }, baseline.constraintMode);
    return bounds;
  });
}

/** Restores the constrained domain state to Fabric's baseline frame. */
export function toConstrainedFocusLogoFabricFrame(
  transform: FocusLogoTransform,
  baseline: FocusLogoTransformBaseline
): FocusLogoFabricFrame {
  return toFabricFrameFromTransform(transform, baseline.rect, baseline.previewScale, baseline.currentScale);
}
