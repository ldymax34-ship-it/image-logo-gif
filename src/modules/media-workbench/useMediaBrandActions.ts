import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  classifyAspect, createBrandAssetFromFile, getBoardPreviewKey, normalizeLogoGroup,
  type BoardBrandStateMap, type BoardPreviewState, type BrandAsset, type BrandLanguage,
  type BrandLayerState, type CprState, type LogoGroupState, type MaterialAsset, type MaterialSpec
} from '../../core';
import type { BoardBrandAction } from './boardBrandReducer';
import { updateBoardCrop } from './mediaWorkbenchActions';

function resolvePreferredBrandAssetId(assets: BrandAsset[], type: BrandAsset['type'], language: BrandLanguage, selectedId?: string): string | undefined {
  const candidates = assets.filter((asset) => asset.type === type); if (!candidates.length) return undefined;
  const selected = candidates.find((asset) => asset.id === selectedId);
  if (selected?.language === language) return selected.id;
  return candidates.find((asset) => asset.language === language)?.id ?? candidates.find((asset) => asset.language === 'custom')?.id ?? selected?.id ?? candidates[0]?.id;
}

export function useMediaBrandActions(input: {
  assets: MaterialAsset[]; specs: MaterialSpec[]; boardBrandStates: BoardBrandStateMap; brandAssets: BrandAsset[];
  brandLayer: BrandLayerState; selectedBoardKey?: string; focusSpec?: MaterialSpec; focusPreviewKey?: string;
  replacingResourceId?: string; logoInputRef: MutableRefObject<HTMLInputElement | null>; defaultLogoGroup: LogoGroupState;
  setPreviewStates: Dispatch<SetStateAction<Record<string, BoardPreviewState>>>; dispatchBoardBrand: Dispatch<BoardBrandAction>;
  setBrandLayer: Dispatch<SetStateAction<BrandLayerState>>; setBrandAssets: Dispatch<SetStateAction<BrandAsset[]>>;
  setSelectedAssetId: Dispatch<SetStateAction<string | undefined>>; setSelectedSpecId: Dispatch<SetStateAction<string | undefined>>;
  setReplacingResourceId: Dispatch<SetStateAction<string | undefined>>; setMessage: Dispatch<SetStateAction<string>>; closeFocusEditor: () => void;
}) {
  function saveFocusPreview(nextPreviewState: BoardPreviewState, nextLogoGroup: LogoGroupState, nextCprState: CprState) {
    const key = getBoardPreviewKey(nextPreviewState.assetId, nextPreviewState.specId);
    input.setPreviewStates((previous) => updateBoardCrop(previous, nextPreviewState));
    input.dispatchBoardBrand({ type: 'update-logo', key, logo: nextLogoGroup }); input.dispatchBoardBrand({ type: 'update-cpr', key, cpr: nextCprState });
    input.setSelectedAssetId(nextPreviewState.assetId); input.setSelectedSpecId(nextPreviewState.specId); input.closeFocusEditor(); input.setMessage('已保存当前画板调整');
  }
  function applyLogoGroupToSameAspect(nextLogoGroup: LogoGroupState) {
    if (!input.focusSpec) return;
    const family = classifyAspect({ width: input.focusSpec.width, height: input.focusSpec.height });
    const keys = input.assets.flatMap((asset) => input.specs.filter((spec) => classifyAspect({ width: spec.width, height: spec.height }) === family).map((spec) => getBoardPreviewKey(asset.id, spec.id)));
    const source = input.boardBrandStates[input.focusPreviewKey ?? '']; if (source) input.dispatchBoardBrand({ type: 'apply-brand', keys, source: { ...source, logo: nextLogoGroup } });
    input.setMessage(`已将品牌位置应用到 ${keys.length} 个${family === 'landscape' ? '横版' : family === 'portrait' ? '竖版' : '方图'}画板`);
  }
  function changeBrandLanguage(language: BrandLanguage) {
    const selectedId = resolvePreferredBrandAssetId(input.brandAssets, 'logo', language, input.brandLayer.selectedLogoId);
    input.setBrandLayer((previous) => ({ ...previous, logoLanguage: language, selectedLogoId: selectedId }));
    if (input.selectedBoardKey) input.dispatchBoardBrand({ type: 'update-logo', key: input.selectedBoardKey, logo: { ...normalizeLogoGroup(input.boardBrandStates[input.selectedBoardKey]?.logo ?? input.defaultLogoGroup), gameLogoLanguage: language, gameLogoId: selectedId } });
  }
  async function handleLogoFiles(fileList: FileList | null, language = input.brandLayer.logoLanguage) {
    const files = Array.from(fileList ?? []); if (!files.length) return; input.setMessage('正在读取 SVG 资源...');
    try {
      const nextAssets = await Promise.all(files.map((file) => createBrandAssetFromFile(file, 'logo', language)));
      input.setBrandAssets((previous) => [...previous.filter((asset) => input.replacingResourceId ? asset.id !== input.replacingResourceId : !(asset.type === 'logo' && asset.language === language)), ...nextAssets]);
      input.setBrandLayer((previous) => ({ ...previous, selectedLogoId: language === 'custom' ? previous.selectedLogoId : nextAssets[0]?.id ?? previous.selectedLogoId }));
      if (language === 'custom' && nextAssets[0]) for (const [key, state] of Object.entries(input.boardBrandStates)) input.dispatchBoardBrand({ type: 'update-logo', key, logo: { ...normalizeLogoGroup(state.logo), companyLogoId: nextAssets[0].id } });
      input.setMessage(`已导入 ${nextAssets.length} 个 Logo SVG`);
    } catch (error) { input.setMessage(error instanceof Error ? error.message : 'SVG 导入失败'); }
    finally { input.setReplacingResourceId(undefined); if (input.logoInputRef.current) input.logoInputRef.current.value = ''; }
  }
  return { saveFocusPreview, applyLogoGroupToSameAspect, changeBrandLanguage, handleLogoFiles };
}
