import { getBoardPreviewKey, type BoardBrandStateMap, type BoardPreviewState, type BrandLayerState, type MaterialAsset, type MaterialSpec } from '../../core';

export function selectBoardKey(asset?: MaterialAsset, spec?: MaterialSpec) { return asset && spec ? getBoardPreviewKey(asset.id, spec.id) : undefined; }
export function selectBoardBrandState(states: BoardBrandStateMap, key: string | undefined) { return key ? states[key] : undefined; }
export function selectBoardPreviewState(states: Record<string, BoardPreviewState>, key: string | undefined) { return key ? states[key] : undefined; }
export function withBoardBrandLayer(layer: BrandLayerState, state: ReturnType<typeof selectBoardBrandState>) {
  return state ? { ...layer, logoEnabled: state.logoEnabled ?? layer.logoEnabled, logoEffect: state.logoEffect ?? layer.logoEffect, logoGroup: state.logo, cprState: state.cpr, cprEnabled: state.cpr.enabled } : layer;
}
