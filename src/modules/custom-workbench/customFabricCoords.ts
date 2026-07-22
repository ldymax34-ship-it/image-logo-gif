export type CanvasPoint = { x: number; y: number };

export type CanvasRect = CanvasPoint & {
  width: number;
  height: number;
};

export type FabricFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
};

export type CustomObjectTransform = CanvasPoint & {
  scale: number;
};

export type TransformBaseline = {
  id: 'game' | 'company' | 'cpr';
  rect: CanvasRect;
  currentScale: number;
  minScale: number;
  maxScale: number;
  canvas: { width: number; height: number };
  previewScale: number;
};

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Converts a Render Plan layer rectangle into Fabric's CSS-pixel coordinate
 * space. Device pixel ratio deliberately does not alter logical coordinates:
 * Fabric handles its backing-store scaling separately.
 */
export function toFabricFrame(rect: CanvasRect, previewScale: number, _devicePixelRatio = 1): FabricFrame {
  const scale = Math.max(Number.EPSILON, finite(previewScale, 1));
  return {
    left: finite(rect.x) * scale,
    top: finite(rect.y) * scale,
    width: Math.max(1, finite(rect.width, 1)) * scale,
    height: Math.max(1, finite(rect.height, 1)) * scale,
    scaleX: 1,
    scaleY: 1
  };
}

/** Converts a Fabric object transform back to the existing domain offset/scale. */
export function fromFabricFrame(
  frame: FabricFrame,
  baseRect: CanvasRect,
  previewScale: number,
  currentScale: number,
  canvas: { width: number; height: number },
  minScale: number,
  maxScale: number
): CustomObjectTransform {
  const displayScale = Math.max(Number.EPSILON, finite(previewScale, 1));
  const rawMultiplier = Math.abs(finite(frame.scaleX, 1));
  return constrainCustomTransform(
    {
      x: finite(frame.left) / displayScale,
      y: finite(frame.top) / displayScale,
      scale: currentScale * rawMultiplier
    },
    baseRect,
    currentScale,
    canvas,
    minScale,
    maxScale
  );
}

/** Applies the same scale-aware bounds constraint for Fabric and numeric edits. */
export function getCustomObjectScaleLimits(
  baseRect: CanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  minScale = .01
): { minScale: number; maxScale: number } {
  const baseWidth = Math.max(Number.EPSILON, baseRect.width / Math.max(Number.EPSILON, currentScale));
  const baseHeight = Math.max(Number.EPSILON, baseRect.height / Math.max(Number.EPSILON, currentScale));
  return {
    minScale: Math.max(.01, minScale),
    maxScale: Math.max(.01, Math.min(canvas.width / baseWidth, canvas.height / baseHeight))
  };
}

export function constrainCustomTransform(
  transform: CustomObjectTransform,
  baseRect: CanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  minScale: number,
  _maxScale: number
): CustomObjectTransform {
  const limits = getCustomObjectScaleLimits(baseRect, currentScale, canvas, minScale);
  const nextScale = clamp(finite(transform.scale, currentScale), limits.minScale, limits.maxScale);
  const bounds = getCustomTransformBounds(baseRect, currentScale, canvas, nextScale);

  return {
    x: clamp(finite(transform.x), 0, bounds.maxX),
    y: clamp(finite(transform.y), 0, bounds.maxY),
    scale: nextScale
  };
}

/** Returns the actual canvas-space X/Y limits for a proposed object scale. */
export function getCustomTransformBounds(
  baseRect: CanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  proposedScale = currentScale
): { maxX: number; maxY: number; width: number; height: number } {
  const multiplier = finite(proposedScale, currentScale) / Math.max(Number.EPSILON, currentScale);
  const width = Math.max(1, baseRect.width * multiplier);
  const height = Math.max(1, baseRect.height * multiplier);
  return {
    maxX: Math.max(0, canvas.width - width),
    maxY: Math.max(0, canvas.height - height),
    width,
    height
  };
}

/** Freezes all values needed to interpret one Fabric drag or scale gesture. */
export function createTransformBaseline(
  id: TransformBaseline['id'],
  item: Pick<TransformBaseline, 'rect' | 'currentScale' | 'minScale' | 'maxScale'>,
  canvas: TransformBaseline['canvas'],
  previewScale: number
): TransformBaseline {
  return {
    id,
    rect: { ...item.rect },
    currentScale: item.currentScale,
    minScale: item.minScale,
    maxScale: item.maxScale,
    canvas: { ...canvas },
    previewScale
  };
}

/** Uses only the frozen baseline, never a React-reconciled item from the same gesture. */
export function fromFabricFrameWithBaseline(frame: FabricFrame, baseline: TransformBaseline): CustomObjectTransform {
  return fromFabricFrame(
    frame,
    baseline.rect,
    baseline.previewScale,
    baseline.currentScale,
    baseline.canvas,
    baseline.minScale,
    baseline.maxScale
  );
}

/** Restores the constrained Fabric frame after a transform event. */
export function toConstrainedFabricFrame(
  transform: CustomObjectTransform,
  baseRect: CanvasRect,
  previewScale: number,
  currentScale: number
): FabricFrame {
  const displayScale = Math.max(Number.EPSILON, finite(previewScale, 1));
  const multiplier = transform.scale / Math.max(Number.EPSILON, currentScale);
  return {
    left: transform.x * displayScale,
    top: transform.y * displayScale,
    width: Math.max(1, baseRect.width) * displayScale,
    height: Math.max(1, baseRect.height) * displayScale,
    scaleX: multiplier,
    scaleY: multiplier
  };
}
