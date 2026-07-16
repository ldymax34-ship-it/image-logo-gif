import { useEffect, useRef, useState } from 'react';
import { BrandSettingsDialog } from '../components';
import {
  DEFAULT_BRAND_ASSETS,
  createBrandAssetFromFile,
  type BrandAsset,
  type BrandLanguage
} from '../core';
import { useAppRuntime } from './AppRuntimeProvider';

function resolvePreferredBrandAssetId(
  assets: BrandAsset[],
  type: BrandAsset['type'],
  language: BrandLanguage,
  selectedId?: string
): string | undefined {
  const candidates = assets.filter((asset) => asset.type === type);
  const selected = candidates.find((asset) => asset.id === selectedId);
  if (selected?.language === language) return selected.id;
  return candidates.find((asset) => asset.language === language)?.id
    ?? candidates.find((asset) => asset.language === 'custom')?.id
    ?? selected?.id
    ?? candidates[0]?.id;
}

export function GlobalDialogs() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadLanguage, setUploadLanguage] = useState<BrandLanguage>('zh-CN');
  const [replacingResourceId, setReplacingResourceId] = useState<string>();
  const {
    brandAssets,
    setBrandAssets,
    brandLayer,
    setBrandLayer,
    brandSettings,
    setBrandSettings,
    settingsDialogOpen,
    setSettingsDialogOpen,
    setSettingsDirty,
    settingsSelectedCompanyLogoId,
    notifyBrandResourceMessage,
    notifyCompanyLogoReplacement
  } = useAppRuntime();
  const logoAssets = brandAssets.filter((asset) => asset.type === 'logo');

  useEffect(() => {
    setBrandLayer((previous) => {
      const selectedLogoId = resolvePreferredBrandAssetId(brandAssets, 'logo', previous.logoLanguage, previous.selectedLogoId);
      const selectedCprId = resolvePreferredBrandAssetId(brandAssets, 'cpr', previous.cprLanguage, previous.selectedCprId);
      return selectedLogoId === previous.selectedLogoId && selectedCprId === previous.selectedCprId
        ? previous
        : { ...previous, selectedLogoId, selectedCprId };
    });
  }, [brandAssets, setBrandLayer]);

  async function handleLogoFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    notifyBrandResourceMessage('正在读取 SVG 资源...');
    try {
      const nextAssets = await Promise.all(files.map((file) => createBrandAssetFromFile(file, 'logo', uploadLanguage)));
      setBrandAssets((previous) => [
        ...previous.filter((asset) => replacingResourceId ? asset.id !== replacingResourceId : !(asset.type === 'logo' && asset.language === uploadLanguage)),
        ...nextAssets
      ]);
      setBrandLayer((previous) => ({
        ...previous,
        selectedLogoId: uploadLanguage === 'custom' ? previous.selectedLogoId : nextAssets[0]?.id ?? previous.selectedLogoId
      }));
      if (uploadLanguage === 'custom' && nextAssets[0]) {
        notifyCompanyLogoReplacement(nextAssets[0].id);
      }
      notifyBrandResourceMessage(`已导入 ${nextAssets.length} 个 Logo SVG`);
    } catch (error) {
      notifyBrandResourceMessage(error instanceof Error ? error.message : 'SVG 导入失败');
    } finally {
      setReplacingResourceId(undefined);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return <>
    {settingsDialogOpen ? <BrandSettingsDialog
      settings={brandSettings}
      assets={brandAssets}
      selectedLogoId={brandLayer.selectedLogoId}
      selectedCompanyLogoId={settingsSelectedCompanyLogoId}
      onSelectResource={(asset) => {
        if (asset.language !== 'custom') {
          setBrandLayer((previous) => ({ ...previous, logoLanguage: asset.language, selectedLogoId: asset.id }));
        }
      }}
      onReplaceResource={(asset, language) => {
        setReplacingResourceId(asset?.id);
        setUploadLanguage(language);
        inputRef.current?.click();
      }}
      onRestoreResources={() => {
        setBrandAssets(DEFAULT_BRAND_ASSETS);
        notifyBrandResourceMessage('已恢复内置品牌资源');
      }}
      onDirtyChange={setSettingsDirty}
      onClose={() => setSettingsDialogOpen(false)}
      onChange={setBrandSettings}
    /> : null}
    <input ref={inputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(event) => void handleLogoFiles(event.target.files)} />
  </>;
}
