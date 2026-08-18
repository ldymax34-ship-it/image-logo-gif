import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { createMaterialAsset, releaseMaterialAsset, type BoardPreviewState, type MaterialAsset } from '../../core';
import { notify } from '../../components/ui/toastBus';
import type { BoardBrandAction } from './boardBrandReducer';
import type { PendingConfirmation } from './useMediaWorkbenchState';

export function useMediaAssetActions(input: {
  assets: MaterialAsset[]; selectedAssetId?: string; focusAssetId?: string;
  imageInputRef: MutableRefObject<HTMLInputElement | null>; focusReturnRef: MutableRefObject<HTMLElement | null>;
  setAssets: Dispatch<SetStateAction<MaterialAsset[]>>; setSelectedAssetId: Dispatch<SetStateAction<string | undefined>>;
  setSelectedSpecId: Dispatch<SetStateAction<string | undefined>>; setPreviewStates: Dispatch<SetStateAction<Record<string, BoardPreviewState>>>;
  setFocusAssetId: Dispatch<SetStateAction<string | undefined>>; setFocusSpecId: Dispatch<SetStateAction<string | undefined>>;
  setImportFailures: Dispatch<SetStateAction<string[]>>; setMessage: (message: string) => void;
  setPendingConfirmation: Dispatch<SetStateAction<PendingConfirmation | undefined>>; dispatchBoardBrand: Dispatch<BoardBrandAction>;
}) {
  async function handleImageFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []); if (!files.length) return;
    input.setMessage('正在读取图片尺寸...');
    const results = await Promise.allSettled(files.map((file) => createMaterialAsset({ kind: 'file', file })));
    const nextAssets = results.filter((result): result is PromiseFulfilledResult<MaterialAsset> => result.status === 'fulfilled').map((result) => result.value);
    const failures = results.flatMap((result, index) => result.status === 'rejected' ? [`${files[index]?.name ?? '未知文件'}：${result.reason instanceof Error ? result.reason.message : '导入失败'}`] : []);
    if (nextAssets.length) { input.setAssets((previous) => [...previous, ...nextAssets]); input.setSelectedAssetId((current) => current ?? nextAssets[0]?.id); }
    input.setImportFailures(failures);
    if (failures.length) {
      input.setMessage('部分图片导入失败，详情见素材列表');
      notify('error', nextAssets.length
        ? `已导入 ${nextAssets.length} 张图片，${failures.length} 个文件失败`
        : `图片导入失败：${failures.length} 个文件均未能读取`);
    } else {
      input.setMessage(`已导入 ${nextAssets.length} 张图片`);
    }
    if (input.imageInputRef.current) input.imageInputRef.current.value = '';
  }
  function selectBoard(assetId: string, specId: string) { input.setSelectedAssetId(assetId); input.setSelectedSpecId(specId); }
  function selectAssetAndScroll(assetId: string) { input.setSelectedAssetId(assetId); requestAnimationFrame(() => document.getElementById(`asset-board-group-${assetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  function requestDeleteAsset(assetId: string) { const asset = input.assets.find((item) => item.id === assetId); if (asset) input.setPendingConfirmation({ type: 'delete-asset', assetId, fileName: asset.fileName }); }
  function closeFocusEditor() { input.setFocusAssetId(undefined); input.setFocusSpecId(undefined); requestAnimationFrame(() => input.focusReturnRef.current?.focus()); }
  function deleteAsset(assetId: string) {
    const index = input.assets.findIndex((asset) => asset.id === assetId); if (index < 0) return;
    const removed = input.assets[index]; const replacement = input.assets[index + 1] ?? input.assets[index - 1];
    releaseMaterialAsset(removed); input.setAssets((previous) => previous.filter((asset) => asset.id !== assetId));
    input.setPreviewStates((previous) => Object.fromEntries(Object.entries(previous).filter(([, state]) => state.assetId !== assetId)));
    input.dispatchBoardBrand({ type: 'remove-asset', assetId }); if (input.focusAssetId === assetId) closeFocusEditor();
    if (input.selectedAssetId === assetId) input.setSelectedAssetId(replacement?.id); input.setMessage(`已删除素材：${removed.fileName}`);
  }
  function openFocusEditor(assetId: string, specId: string) { input.focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; input.setSelectedAssetId(assetId); input.setSelectedSpecId(specId); input.setFocusAssetId(assetId); input.setFocusSpecId(specId); }
  return { handleImageFiles, selectBoard, selectAssetAndScroll, requestDeleteAsset, deleteAsset, openFocusEditor, closeFocusEditor };
}
