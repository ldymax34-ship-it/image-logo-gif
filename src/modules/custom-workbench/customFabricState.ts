import type { CustomFabricObjectId } from './customFabricItems';
import { constrainCustomTransform, type CanvasRect, type CustomObjectTransform } from './customFabricCoords';

export type CustomFabricTransformPatch = {
  gameOffset?: { x: number; y: number };
  gameScale?: number;
  companyOffset?: { x: number; y: number };
  companyScale?: number;
  cprOffset?: { x: number; y: number };
  cprScale?: number;
};

/**
 * Reuses the Fabric geometry rule after a canvas-size change so all fixed
 * objects remain fully inside the newly selected custom canvas.
 */
export function constrainCustomCanvasObjectTransform(
  transform: CustomObjectTransform,
  rect: CanvasRect,
  currentScale: number,
  canvas: { width: number; height: number },
  minScale = .01
): CustomObjectTransform {
  return constrainCustomTransform(transform, rect, currentScale, canvas, minScale, Number.POSITIVE_INFINITY);
}

/** Converts Fabric interaction output into existing CustomWorkbench domain fields. */
export function toCustomFabricTransformPatch(
  id: CustomFabricObjectId,
  transform: CustomObjectTransform,
  cprDefaultPosition: { x: number; y: number }
): CustomFabricTransformPatch {
  if (id === 'game') return { gameOffset: { x: transform.x, y: transform.y }, gameScale: transform.scale };
  if (id === 'company') return { companyOffset: { x: transform.x, y: transform.y }, companyScale: transform.scale };
  return {
    cprOffset: { x: transform.x - cprDefaultPosition.x, y: transform.y - cprDefaultPosition.y },
    cprScale: transform.scale
  };
}
