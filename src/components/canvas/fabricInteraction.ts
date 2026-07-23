export type CanvasPoint = { x: number; y: number };
export type CanvasRect = CanvasPoint & { width: number; height: number };
export type CanvasTransform = CanvasPoint & { scale: number };
export type FabricFrame = { left: number; top: number; width: number; height: number; scaleX: number; scaleY: number };
export type TransformBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type TransformBaseline<Id extends string = string> = {
  id: Id;
  rect: CanvasRect;
  currentScale: number;
  minScale: number;
  maxScale: number;
  canvas: { width: number; height: number };
  previewScale: number;
};

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Maps a Render Plan rectangle to Fabric's logical CSS-pixel coordinate space. */
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

export function toFabricFrameFromTransform(
  transform: CanvasTransform,
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

export function createTransformBaseline<Id extends string>(
  id: Id,
  item: Pick<TransformBaseline<Id>, 'rect' | 'currentScale' | 'minScale' | 'maxScale'>,
  canvas: TransformBaseline<Id>['canvas'],
  previewScale: number
): TransformBaseline<Id> {
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

export function constrainTransform(
  transform: CanvasTransform,
  minScale: number,
  maxScale: number,
  boundsForScale: (scale: number) => TransformBounds
): CanvasTransform {
  const scale = clamp(finite(transform.scale, minScale), minScale, maxScale);
  const bounds = boundsForScale(scale);
  return {
    x: clamp(finite(transform.x), bounds.minX, bounds.maxX),
    y: clamp(finite(transform.y), bounds.minY, bounds.maxY),
    scale
  };
}

export function fromFabricFrame(
  frame: FabricFrame,
  baseline: Pick<TransformBaseline, 'currentScale' | 'minScale' | 'maxScale' | 'previewScale'>,
  boundsForScale: (scale: number) => TransformBounds
): CanvasTransform {
  return constrainTransform({
    x: finite(frame.left) / Math.max(Number.EPSILON, finite(baseline.previewScale, 1)),
    y: finite(frame.top) / Math.max(Number.EPSILON, finite(baseline.previewScale, 1)),
    scale: baseline.currentScale * Math.max(Number.EPSILON, Math.abs(finite(frame.scaleX, 1)))
  }, baseline.minScale, baseline.maxScale, boundsForScale);
}

export function fromFabricFrameWithBaseline<Id extends string>(
  frame: FabricFrame,
  baseline: TransformBaseline<Id>,
  boundsForScale: (scale: number) => TransformBounds
): CanvasTransform {
  return fromFabricFrame(frame, baseline, boundsForScale);
}

export function getCanvasScaleLimits(
  baseRect: CanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  minScale = .01
): { minScale: number; maxScale: number } {
  const baseWidth = Math.max(Number.EPSILON, baseRect.width / Math.max(Number.EPSILON, currentScale));
  const baseHeight = Math.max(Number.EPSILON, baseRect.height / Math.max(Number.EPSILON, currentScale));
  return { minScale: Math.max(.01, minScale), maxScale: Math.max(.01, Math.min(canvas.width / baseWidth, canvas.height / baseHeight)) };
}

export function getCanvasTransformBounds(
  baseRect: CanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  proposedScale = currentScale
): TransformBounds & { width: number; height: number } {
  const multiplier = finite(proposedScale, currentScale) / Math.max(Number.EPSILON, currentScale);
  const width = Math.max(1, baseRect.width * multiplier);
  const height = Math.max(1, baseRect.height * multiplier);
  return { minX: 0, minY: 0, maxX: Math.max(0, canvas.width - width), maxY: Math.max(0, canvas.height - height), width, height };
}

export function constrainCanvasTransform(
  transform: CanvasTransform,
  baseRect: CanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  minScale: number
): CanvasTransform {
  const limits = getCanvasScaleLimits(baseRect, currentScale, canvas, minScale);
  return constrainTransform(transform, limits.minScale, limits.maxScale, (scale) => getCanvasTransformBounds(baseRect, currentScale, canvas, scale));
}
