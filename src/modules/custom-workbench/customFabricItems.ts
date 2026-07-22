import { getCustomObjectScaleLimits, type CanvasRect } from './customFabricCoords';

export type CustomFabricObjectId = 'game' | 'company' | 'cpr';

export type CustomFabricOverlayItem = {
  id: CustomFabricObjectId;
  rect: CanvasRect;
  visible: boolean;
  currentScale: number;
  minScale: number;
  maxScale: number;
};

export type CustomFabricReconcilePlan = {
  /** New Render Plan-backed interaction objects that Fabric must create. */
  create: CustomFabricOverlayItem[];
  /** Existing objects whose frame or visibility must be reconciled. */
  update: CustomFabricOverlayItem[];
  /** Objects whose Render Plan layer no longer exists. */
  remove: CustomFabricObjectId[];
  /** The Fabric active object must be released (hidden or no longer present). */
  discardActive: boolean;
};

type RenderPlanLike = {
  layers: Array<{ type: 'logo' | 'cpr'; rect: CanvasRect }>;
};

/** Uses real Render Plan layer rectangles; no fixed hitbox dimensions are allowed. */
export function resolveCustomFabricItems({
  gamePlan,
  companyPlan,
  gameEnabled,
  companyEnabled,
  cprEnabled,
  gameScale,
  companyScale,
  cprScale,
  canvas
}: {
  gamePlan?: RenderPlanLike;
  companyPlan?: RenderPlanLike;
  gameEnabled: boolean;
  companyEnabled: boolean;
  cprEnabled: boolean;
  gameScale: number;
  companyScale: number;
  cprScale: number;
  canvas: { width: number; height: number };
}): CustomFabricOverlayItem[] {
  const gameRect = gamePlan?.layers.find((item) => item.type === 'logo')?.rect;
  const companyRect = companyPlan?.layers.find((item) => item.type === 'logo')?.rect;
  const cprRect = gamePlan?.layers.find((item) => item.type === 'cpr')?.rect;

  const toItem = (id: CustomFabricObjectId, rect: CanvasRect, visible: boolean, currentScale: number, minScale: number): CustomFabricOverlayItem => ({
    id,
    rect,
    visible,
    currentScale,
    minScale,
    maxScale: getCustomObjectScaleLimits(rect, currentScale, canvas, minScale).maxScale
  });

  return [
    gameRect ? toItem('game', gameRect, gameEnabled, gameScale, .01) : undefined,
    companyRect ? toItem('company', companyRect, companyEnabled, companyScale, .01) : undefined,
    cprRect ? toItem('cpr', cprRect, cprEnabled, cprScale, .01) : undefined
  ].filter((item): item is CustomFabricOverlayItem => Boolean(item));
}

/**
 * Plans the fixed-object reconcile without depending on Fabric. Hidden items
 * deliberately remain in `update`: hiding preserves their domain transform;
 * only a missing Render Plan layer removes an interaction object.
 */
export function resolveCustomFabricReconcilePlan(
  nextItems: CustomFabricOverlayItem[],
  existingIds: Iterable<CustomFabricObjectId>,
  activeId?: CustomFabricObjectId
): CustomFabricReconcilePlan {
  const existing = new Set(existingIds);
  const nextById = new Map(nextItems.map((item) => [item.id, item]));
  const remove = [...existing].filter((id) => !nextById.has(id));
  const create = nextItems.filter((item) => !existing.has(item.id));
  const update = nextItems.filter((item) => existing.has(item.id));
  const activeItem = activeId ? nextById.get(activeId) : undefined;

  return {
    create,
    update,
    remove,
    discardActive: Boolean(activeId && (!activeItem || !activeItem.visible))
  };
}
