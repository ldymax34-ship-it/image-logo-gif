import { getBoardPreviewKey, type BoardBrandStateMap, type BoardPreviewState, type CanvasSize, type CprState, type LogoGroupState, type MaterialAsset, type MaterialSpec } from '../../core';

export type BrandScopeKind = 'same-size' | 'same-asset';
export type ScopeLayer = 'logo' | 'cpr' | 'crop';

export type SyncScopeResult = {
  sourceKey: string;
  sourceAssetId: string;
  sourceSpecId: string;
  scope: BrandScopeKind;
  layer: ScopeLayer;
  requested: number;
  targetKeys: string[];
  missingKeys: string[];
  targetDescription: string;
};

function getAllBoardKeys(assets: MaterialAsset[], specs: MaterialSpec[]): string[] {
  return assets.flatMap((asset) => specs.map((spec) => getBoardPreviewKey(asset.id, spec.id)));
}

export function resolveSyncScope(input: {
  assets: MaterialAsset[];
  specs: MaterialSpec[];
  boardBrandStates: BoardBrandStateMap;
  sourceAssetId: string;
  sourceSpecId: string;
  scope: BrandScopeKind;
  layer: ScopeLayer;
}): SyncScopeResult {
  const { assets, specs, boardBrandStates, sourceAssetId, sourceSpecId, scope, layer } = input;
  const sourceKey = getBoardPreviewKey(sourceAssetId, sourceSpecId);
  const sourceSpec = specs.find((spec) => spec.id === sourceSpecId);
  const sourceAsset = assets.find((asset) => asset.id === sourceAssetId);
  const allKeys = getAllBoardKeys(assets, specs);

  let targetKeys: string[];
  if (scope === 'same-size') {
    const { width, height } = sourceSpec ?? { width: 0, height: 0 };
    targetKeys = allKeys.filter((key) => {
      if (key === sourceKey) return false;
      const [assetId, specId] = key.split(':');
      const spec = specs.find((candidate) => candidate.id === specId);
      return spec?.width === width && spec?.height === height;
    });
  } else {
    targetKeys = allKeys.filter((key) => key !== sourceKey && key.startsWith(`${sourceAssetId}:`));
  }

  const missingKeys = targetKeys.filter((key) => !boardBrandStates[key]);
  const availableTargets = targetKeys.filter((key) => boardBrandStates[key]);
  const requested = targetKeys.length;

  const layerLabel = layer === 'logo' ? 'Logo' : 'CPR';
  const targetDescription = scope === 'same-size'
    ? `所有其他 ${sourceSpec?.width ?? '-'} × ${sourceSpec?.height ?? '-'} 同尺寸画板`
    : `素材“${sourceAsset?.fileName ?? '当前素材'}”的其他尺寸画板`;

  return {
    sourceKey,
    sourceAssetId,
    sourceSpecId,
    scope,
    layer,
    requested,
    targetKeys: availableTargets,
    missingKeys,
    targetDescription: `${layerLabel} · ${targetDescription}`
  };
}

export function resolveCropSyncScope(input: {
  assets: MaterialAsset[];
  specs: MaterialSpec[];
  previewStates: Record<string, BoardPreviewState>;
  sourceAssetId: string;
  sourceSpecId: string;
}): SyncScopeResult {
  const { assets, specs, previewStates, sourceAssetId, sourceSpecId } = input;
  const sourceKey = getBoardPreviewKey(sourceAssetId, sourceSpecId);
  const sourceSpec = specs.find((spec) => spec.id === sourceSpecId);
  const sourceAsset = assets.find((asset) => asset.id === sourceAssetId);
  const { width, height } = sourceSpec ?? { width: 0, height: 0 };
  const allKeys = getAllBoardKeys(assets, specs);

  const targetKeys = allKeys.filter((key) => {
    if (key === sourceKey) return false;
    const [assetId, specId] = key.split(':');
    if (assetId !== sourceAssetId) return false;
    const spec = specs.find((candidate) => candidate.id === specId);
    return spec?.width === width && spec?.height === height;
  });

  const missingKeys = targetKeys.filter((key) => !previewStates[key]);
  const availableTargets = targetKeys.filter((key) => previewStates[key]);

  return {
    sourceKey,
    sourceAssetId,
    sourceSpecId,
    scope: 'same-size',
    layer: 'crop',
    requested: targetKeys.length,
    targetKeys: availableTargets,
    missingKeys,
    targetDescription: `裁切 · 素材“${sourceAsset?.fileName ?? '当前素材'}”中 ${width} × ${height} 的其他画板`
  };
}

/**
 * Normalize a Logo group's custom position when syncing across different canvas sizes.
 * Non-custom placements (corner-left, center, corner-right) keep their semantic anchor.
 * Custom manualOffset is scaled proportionally; placeGroup will clamp to target bounds.
 */
export function normalizeLogoForTarget(logo: LogoGroupState, source: CanvasSize, target: CanvasSize): LogoGroupState {
  if (source.width === target.width && source.height === target.height) return { ...logo };
  if (logo.placement !== 'custom' || !logo.manualOffset) return { ...logo };
  return {
    ...logo,
    manualOffset: {
      x: logo.manualOffset.x * target.width / source.width,
      y: logo.manualOffset.y * target.height / source.height
    }
  };
}

/**
 * Normalize a CPR state's custom offset when syncing across different canvas sizes.
 * Non-custom placements keep their semantic anchor; only custom offsets are scaled.
 */
export function normalizeCprForTarget(cpr: CprState, source: CanvasSize, target: CanvasSize): CprState {
  if (source.width === target.width && source.height === target.height) return { ...cpr };
  if (cpr.transform.placement !== 'custom') return { ...cpr };
  return {
    ...cpr,
    transform: {
      ...cpr.transform,
      offsetX: cpr.transform.offsetX * target.width / source.width,
      offsetY: cpr.transform.offsetY * target.height / source.height
    }
  };
}
