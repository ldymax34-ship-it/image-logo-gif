import {
  constrainCanvasTransform,
  fromFabricFrame as fromSharedFabricFrame,
  fromFabricFrameWithBaseline as fromSharedFabricFrameWithBaseline,
  getCanvasScaleLimits,
  getCanvasTransformBounds,
  toFabricFrame as toSharedFabricFrame,
  toFabricFrameFromTransform,
  type CanvasRect,
  type CanvasTransform,
  type FabricFrame,
  type TransformBaseline as SharedTransformBaseline
} from '../../components/canvas/fabricInteraction';

export type { CanvasRect, FabricFrame };
export type CustomObjectTransform = CanvasTransform;
export type TransformBaseline = SharedTransformBaseline<'game' | 'company' | 'cpr'>;

export const toFabricFrame = toSharedFabricFrame;

export function fromFabricFrame(
  frame: FabricFrame,
  baseRect: CanvasRect,
  previewScale: number,
  currentScale: number,
  canvas: { width: number; height: number },
  minScale: number,
  _maxScale: number
): CustomObjectTransform {
  const limits = getCanvasScaleLimits(baseRect, currentScale, canvas, minScale);
  return fromSharedFabricFrame(frame, {
    currentScale,
    minScale: limits.minScale,
    maxScale: limits.maxScale,
    previewScale
  }, (scale) => getCanvasTransformBounds(baseRect, currentScale, canvas, scale));
}

export const getCustomObjectScaleLimits = getCanvasScaleLimits;
export const getCustomTransformBounds = getCanvasTransformBounds;

export function constrainCustomTransform(
  transform: CustomObjectTransform,
  baseRect: CanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  minScale: number,
  _maxScale: number
): CustomObjectTransform {
  return constrainCanvasTransform(transform, baseRect, currentScale, canvas, minScale);
}

export function createTransformBaseline(
  id: TransformBaseline['id'],
  item: Pick<TransformBaseline, 'rect' | 'currentScale' | 'minScale' | 'maxScale'>,
  canvas: TransformBaseline['canvas'],
  previewScale: number
): TransformBaseline {
  return { id, rect: { ...item.rect }, currentScale: item.currentScale, minScale: item.minScale, maxScale: item.maxScale, canvas: { ...canvas }, previewScale };
}

export function fromFabricFrameWithBaseline(frame: FabricFrame, baseline: TransformBaseline): CustomObjectTransform {
  return fromSharedFabricFrameWithBaseline(frame, baseline, (scale) => getCanvasTransformBounds(baseline.rect, baseline.currentScale, baseline.canvas, scale));
}

export function toConstrainedFabricFrame(
  transform: CustomObjectTransform,
  baseRect: CanvasRect,
  previewScale: number,
  currentScale: number
): FabricFrame {
  return toFabricFrameFromTransform(transform, baseRect, previewScale, currentScale);
}
