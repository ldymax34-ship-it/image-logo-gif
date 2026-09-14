import type { Dispatch, SetStateAction } from 'react';
import {
  classifyAspect, getBoardPreviewKey, normalizeLogoGroup,
  normalizeLogoGroupScale, resolveBoardBrandAssets,
  type BoardBrandStateMap, type BoardPreviewState, type BrandAsset, type BrandLanguage,
  type BrandLayerState, type LogoGroupState, type MaterialAsset, type MaterialSpec
} from '../../core';
import type { BoardBrandAction } from './boardBrandReducer';

function resolvePreferredBrandAssetId(assets: BrandAsset[], type: BrandAsset['type'], language: BrandLanguage, selectedId?: string): string | undefined {
  const candidates = assets.filter((asset) => asset.type === type); if (!candidates.length) return undefined;
  const selected = candidates.find((asset) => asset.id === selectedId);
  if (selected?.language === language) return selected.id;
  return candidates.find((asset) => asset.language === language)?.id ?? candidates.find((asset) => asset.language === 'custom')?.id ?? selected?.id ?? candidates[0]?.id;
}

export function useMediaBrandActions(input: {
  assets: MaterialAsset[]; specs: MaterialSpec[]; boardBrandStates: BoardBrandStateMap; brandAssets: BrandAsset[];
  brandLayer: BrandLayerState; selectedBoardKey?: string; focusSpec?: MaterialSpec; focusPreviewKey?: string;
  defaultLogoGroup: LogoGroupState;
  setPreviewStates: Dispatch<SetStateAction<Record<string, BoardPreviewState>>>; dispatchBoardBrand: Dispatch<BoardBrandAction>;
  setBrandLayer: Dispatch<SetStateAction<BrandLayerState>>;
  setSelectedAssetId: Dispatch<SetStateAction<string | undefined>>; setSelectedSpecId: Dispatch<SetStateAction<string | undefined>>;
  setMessage: (message: string) => void;
}) {
  function applyLogoGroupToSameAspect(nextLogoGroup: LogoGroupState) {
    if (!input.focusSpec) return;
    const family = classifyAspect({ width: input.focusSpec.width, height: input.focusSpec.height });
    const keys = input.assets.flatMap((asset) => input.specs.filter((spec) => classifyAspect({ width: spec.width, height: spec.height }) === family).map((spec) => getBoardPreviewKey(asset.id, spec.id)));
    const source = input.boardBrandStates[input.focusPreviewKey ?? '']; if (source) input.dispatchBoardBrand({ type: 'apply-brand', keys, source: { ...source, logo: nextLogoGroup } });
    input.setMessage(`已将 Logo 位置应用到 ${keys.length} 个${family === 'landscape' ? '横版' : family === 'portrait' ? '竖版' : '方图'}画板`);
  }
  function changeBrandLanguage(language: BrandLanguage, scale?: number) {
    const selectedId = resolvePreferredBrandAssetId(input.brandAssets, 'logo', language, input.brandLayer.selectedLogoId);
    input.setBrandLayer((previous) => ({ ...previous, logoLanguage: language, selectedLogoId: selectedId }));
    if (input.selectedBoardKey) input.dispatchBoardBrand({ type: 'update-logo', key: input.selectedBoardKey, logo: { ...normalizeLogoGroup(input.boardBrandStates[input.selectedBoardKey]?.logo ?? input.defaultLogoGroup), gameLogoLanguage: language, gameLogoId: selectedId, scale } });
  }
  function applyCompanyLogoReplacement(assetId: string) {
    for (const [key, state] of Object.entries(input.boardBrandStates)) {
      const nextLogo = { ...normalizeLogoGroup(state.logo), companyLogoId: assetId };
      const spec = input.assets.flatMap((asset) => input.specs.map((candidate) => ({ asset, spec: candidate }))).find(({ asset, spec }) => getBoardPreviewKey(asset.id, spec.id) === key)?.spec;
      const resolved = resolveBoardBrandAssets({ boardBrandState: { ...state, logo: nextLogo }, brandCatalog: input.brandAssets, brandLayer: input.brandLayer });
      const normalized = spec
        ? normalizeLogoGroupScale({ width: spec.width, height: spec.height }, nextLogo, { companyLogo: resolved.companyLogo, gameLogo: resolved.gameLogo })
        : nextLogo;
      input.dispatchBoardBrand({ type: 'update-logo', key, logo: normalized });
    }
  }
  return { applyLogoGroupToSameAspect, changeBrandLanguage, applyCompanyLogoReplacement };
}
