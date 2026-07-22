import type { CustomFabricObjectId } from './customFabricItems';
import type { CustomObjectTransform } from './customFabricCoords';

export type CustomFabricTransformPatch = {
  gameOffset?: { x: number; y: number };
  gameScale?: number;
  companyOffset?: { x: number; y: number };
  companyScale?: number;
  cprOffset?: { x: number; y: number };
  cprScale?: number;
};

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
