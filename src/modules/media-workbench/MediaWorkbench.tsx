import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  BRAND_LANGUAGE_OPTIONS,
  PRESET_TEMPLATES,
  DEFAULT_BRAND_ASSETS,
  DEFAULT_CPR_EFFECT,
  DEFAULT_LOGO_EFFECT,
  buildOutputFileName,
  classifyAspect,
  createBrandAssetFromFile,
  createDefaultCprState,
  normalizeLogoGroup,
  createInitialCropState,
  createMaterialAsset,
  formatFileSize,
  getBoardPreviewKey,
  loadBrandSettings,
  loadCustomPresetTemplates,
  parseSpecText,
  saveBrandSettings,
  saveCustomPresetTemplates,
  serializePresetSpecs,
  toPresetSpecs,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLanguage,
  type BrandLayerState,
  type BrandSettingsV1,
  type BoardBrandStateMap,
  type CprState,
  type FitMode,
  type LogoGroupState,
  type MaterialAsset,
  type MaterialSpec,
  type MaterialFormat,
  type PresetTemplate,
  type WorkbenchState
} from '../../core';
import {
  AssetSidebar,
  BoardOverview,
  BrandSettingsDialog,
  MultiAssetBoardOverview,
  SpecPanel,
  WorkbenchHeader,
  type WorkbenchModule
} from '../../components';
import { AppShell } from '../../app/AppShell';
import { createAppActivity } from '../../app/appActivity';
import { BatchExportDialog } from '../../modules/media-workbench/BatchExportDialog';
import { GifCompressorPlaceholder } from '../../modules/gif-compressor';
import { CustomWorkbench } from '../../modules/custom-workbench/CustomWorkbench';
import { boardBrandReducer } from '../../modules/media-workbench';
import { FocusEditorModal } from './FocusEditorModal';
import { ConfirmationDialog } from './ConfirmationDialog';
import { BrandControlsPanel } from './BrandControlsPanel';
import { selectBoardBrandState, selectBoardKey, selectBoardPreviewState } from './mediaWorkbenchSelectors';
import { updateBoardCrop } from './mediaWorkbenchActions';

const DEFAULT_BRAND_LAYER: BrandLayerState = {
  logoEnabled: true,
  cprEnabled: true,
  logoLanguage: 'zh-CN',
  cprLanguage: 'zh-CN',
  logoAnchor: 'top-right',
  cprAnchor: 'top-right',
  logoSize: 'standard',
  cprSize: 'standard',
  logoEffect: DEFAULT_LOGO_EFFECT,
  cprEffect: DEFAULT_CPR_EFFECT
};

type PresetApplyMode = 'replace' | 'append';

type PendingConfirmation =
  | { type: 'apply-specs'; count: number }
  | { type: 'delete-preset'; presetId: string; presetName: string }
  | { type: 'delete-asset'; assetId: string; fileName: string };

function getAspectLabel(spec: MaterialSpec): string {
  const family = classifyAspect({ width: spec.width, height: spec.height });
  if (family === 'landscape') return 'landscape / 横版';
  if (family === 'portrait') return 'portrait / 竖版';
  return 'square / 方图';
}

function createPreviewState(asset: MaterialAsset, spec: MaterialSpec, fitMode: FitMode = 'cover'): BoardPreviewState {
  return {
    assetId: asset.id,
    specId: spec.id,
    crop: createInitialCropState(asset, spec, fitMode),
    fitMode
  };
}

function ensurePreviewStates(
  previous: Record<string, BoardPreviewState>,
  assets: MaterialAsset[],
  specs: MaterialSpec[]
): Record<string, BoardPreviewState> {
  const next: Record<string, BoardPreviewState> = {};
  for (const asset of assets) {
    for (const spec of specs) {
      const key = getBoardPreviewKey(asset.id, spec.id);
      next[key] = previous[key] ?? createPreviewState(asset, spec, 'cover');
    }
  }
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length === nextKeys.length && nextKeys.every((key) => previous[key] === next[key])) {
    return previous;
  }
  return next;
}

function resolvePreferredBrandAssetId(
  assets: BrandAsset[],
  type: BrandAsset['type'],
  language: BrandLanguage,
  selectedId?: string
): string | undefined {
  const candidates = assets.filter((asset) => asset.type === type);
  if (!candidates.length) return undefined;
  const selected = candidates.find((asset) => asset.id === selectedId);
  if (selected?.language === language) return selected.id;
  return (
    candidates.find((asset) => asset.language === language)?.id ??
    candidates.find((asset) => asset.language === 'custom')?.id ??
    selected?.id ??
    candidates[0]?.id
  );
}

function mergeSpecText(currentText: string, presetText: string): string {
  const normalizedCurrent = currentText.trim();
  const normalizedPreset = presetText.trim();
  if (!normalizedCurrent) return normalizedPreset;
  if (!normalizedPreset) return normalizedCurrent;
  return `${normalizedCurrent}\n${normalizedPreset}`;
}

function createLogoGroupFromSettings(settings: BrandSettingsV1, spec?: MaterialSpec): LogoGroupState {
  const family = spec ? classifyAspect({ width: spec.width, height: spec.height }) : 'landscape';
  const placement = settings.defaultPlacementByAspect[family];
  return {
    mode: settings.defaultLogoGroupMode,
    gameLogoLanguage: settings.defaultLanguage,
    colorMode: settings.defaultColorMode,
    sizePreset: settings.defaultSize,
    companyLogoScale: 'match',
    gapUnits: 0.5,
    placement,
    lastExplicitPlacement: placement
  };
}

export function MediaWorkbench() {
  const [activeModule, setActiveModule] = useState<WorkbenchModule>('media');
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const assetsRef = useRef<MaterialAsset[]>([]);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const [draftText, setDraftText] = useState('');
  const [appliedText, setAppliedText] = useState('');
  const [specs, setSpecs] = useState<MaterialSpec[]>([]);
  const [assets, setAssets] = useState<MaterialAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();
  const [selectedSpecId, setSelectedSpecId] = useState<string | undefined>();
  const [previewStates, setPreviewStates] = useState<Record<string, BoardPreviewState>>({});
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>(DEFAULT_BRAND_ASSETS);
  const [brandLayer, setBrandLayer] = useState<BrandLayerState>(DEFAULT_BRAND_LAYER);
  const [brandSettings, setBrandSettings] = useState<BrandSettingsV1>(() => loadBrandSettings());
  const [boardBrandStates, dispatchBoardBrand] = useReducer(boardBrandReducer, {} as BoardBrandStateMap);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [customPresets, setCustomPresets] = useState<PresetTemplate[]>(() => loadCustomPresetTemplates());
  const [presetApplyMode, setPresetApplyMode] = useState<PresetApplyMode>('replace');
  const [focusAssetId, setFocusAssetId] = useState<string | undefined>();
  const [focusSpecId, setFocusSpecId] = useState<string | undefined>();
  const [focusEditorDirty, setFocusEditorDirty] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | undefined>();
  const [newPresetName, setNewPresetName] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [customWorkbenchDirty, setCustomWorkbenchDirty] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [importFailures, setImportFailures] = useState<string[]>([]);
  const [resourceUploadLanguage, setResourceUploadLanguage] = useState<BrandLanguage>('zh-CN');
  const [replacingResourceId, setReplacingResourceId] = useState<string | undefined>();

  const result = useMemo(() => parseSpecText(draftText), [draftText]);
  const hasPendingSpecChanges = draftText.trim() !== appliedText.trim();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const selectedSpec = specs.find((spec) => spec.id === selectedSpecId) ?? specs[0];
  const selectedBoardKey = selectBoardKey(selectedAsset, selectedSpec);
  const defaultLogoGroup = useMemo(() => createLogoGroupFromSettings(brandSettings), [brandSettings]);
  const defaultCprState = useMemo<CprState>(() => ({
    ...createDefaultCprState(),
    enabled: brandSettings.cprEnabled,
    transform: { placement: brandSettings.defaultCprPlacement, offsetX: 0, offsetY: 0 },
    colorMode: brandSettings.defaultCprColorMode,
    effect: { ...brandLayer.cprEffect, colorEnabled: brandSettings.defaultCprColorMode !== 'original', color: brandSettings.defaultCprColorMode === 'black' ? '#000000' : '#ffffff' }
  }), [brandLayer.cprEffect, brandSettings]);
  const selectedLogoGroup = normalizeLogoGroup(selectedBoardKey ? boardBrandStates[selectedBoardKey]?.logo ?? defaultLogoGroup : defaultLogoGroup);
  const focusAsset = assets.find((asset) => asset.id === focusAssetId);
  const focusSpec = specs.find((spec) => spec.id === focusSpecId);
  const focusPreviewKey = selectBoardKey(focusAsset, focusSpec);
  const focusPreviewState = selectBoardPreviewState(previewStates, focusPreviewKey);
  const logoAssets = brandAssets.filter((asset) => asset.type === 'logo');
  const cprAssets = brandAssets.filter((asset) => asset.type === 'cpr');
  const selectedLogo = logoAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const selectedCpr = cprAssets.find((asset) => asset.id === brandLayer.selectedCprId);
  const selectedCprState = selectBoardBrandState(boardBrandStates, selectedBoardKey)?.cpr ?? defaultCprState;
  const companyLogoAsset = useMemo(
    () => logoAssets.find((asset) => asset.language === 'custom'),
    [logoAssets]
  );
  const gameLogoAsset = selectedLogo?.language !== 'custom' ? selectedLogo : logoAssets.find((asset) => asset.language !== 'custom');

  const workbenchState: WorkbenchState = {
    assets,
    specs,
    selectedAssetId: selectedAsset?.id,
    selectedSpecId: selectedSpec?.id,
    previewStates,
    brandLayer
  };

  useEffect(() => {
    if (!selectedSpecId || !specs.some((spec) => spec.id === selectedSpecId)) {
      setSelectedSpecId(specs[0]?.id);
    }
  }, [selectedSpecId, specs]);

  useEffect(() => {
    if (!selectedAssetId || !assets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(assets[0]?.id);
    }
  }, [assets, selectedAssetId]);

  useEffect(() => {
    setPreviewStates((previous) => ensurePreviewStates(previous, assets, specs));
  }, [assets, specs]);

  useEffect(() => {
    const boardKeys = assets.flatMap((asset) => specs.map((spec) => getBoardPreviewKey(asset.id, spec.id)));
    dispatchBoardBrand({ type: 'reconcile-boards', keys: boardKeys, defaults: { logo: defaultLogoGroup, cpr: defaultCprState } });
  }, [assets, specs, defaultLogoGroup, defaultCprState]);

  useEffect(() => {
    saveBrandSettings(brandSettings);
  }, [brandSettings]);

  useEffect(() => {
    setBrandLayer((previous) => {
      const nextLogoId = resolvePreferredBrandAssetId(brandAssets, 'logo', previous.logoLanguage, previous.selectedLogoId);
      const nextCprId = resolvePreferredBrandAssetId(brandAssets, 'cpr', previous.cprLanguage, previous.selectedCprId);
      if (nextLogoId === previous.selectedLogoId && nextCprId === previous.selectedCprId) {
        return previous;
      }
      return {
        ...previous,
        selectedLogoId: nextLogoId,
        selectedCprId: nextCprId
      };
    });
  }, [brandAssets]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    saveCustomPresetTemplates(customPresets);
  }, [customPresets]);

  useEffect(() => {
    return () => {
      for (const asset of assetsRef.current) {
        URL.revokeObjectURL(asset.objectUrl);
      }
    };
  }, []);

  async function handleImageFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setMessage('正在读取图片尺寸...');
    const results = await Promise.allSettled(files.map((file) => createMaterialAsset(file)));
    const nextAssets = results
      .filter((result): result is PromiseFulfilledResult<MaterialAsset> => result.status === 'fulfilled')
      .map((result) => result.value);
    const failures = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [`${files[index]?.name ?? '未知文件'}：${result.reason instanceof Error ? result.reason.message : '导入失败'}`]
        : []
    );
    if (nextAssets.length) {
      setAssets((previous) => [...previous, ...nextAssets]);
      setSelectedAssetId((current) => current ?? nextAssets[0]?.id);
    }
    setImportFailures(failures);
    setMessage(failures.length ? `已导入 ${nextAssets.length} 张图片，${failures.length} 个文件失败` : `已导入 ${nextAssets.length} 张图片`);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function applyParsedSpecs() {
    const nextSpecs = result.specs;
    const hasExistingBoards = specs.length > 0 || Object.keys(previewStates).length > 0;
    if (hasExistingBoards && hasPendingSpecChanges) {
      setPendingConfirmation({ type: 'apply-specs', count: nextSpecs.length });
      return;
    }
    commitParsedSpecs();
  }

  function commitParsedSpecs() {
    const nextSpecs = result.specs;
    const nextAppliedText = draftText.trim();
    if (!specs.length && nextSpecs.length) {
      const defaults = createLogoGroupFromSettings(brandSettings, nextSpecs[0]);
      const color = defaults.colorMode === 'black' ? '#000000' : '#ffffff';
      setBrandLayer((previous) => ({
        ...previous,
        logoLanguage: brandSettings.defaultLanguage,
        logoEffect: { ...previous.logoEffect, colorEnabled: true, color },
        cprEffect: { ...previous.cprEffect, colorEnabled: brandSettings.defaultCprColorMode !== 'original', color: brandSettings.defaultCprColorMode === 'black' ? '#000000' : '#ffffff' }
      }));
    }
    setSpecs(nextSpecs);
    setAppliedText(nextAppliedText);
    setMessage(nextSpecs.length ? `已应用 ${nextSpecs.length} 个画板` : '已清空画板');
  }

  function restoreAppliedText() {
    setDraftText(appliedText);
    setMessage('已恢复到上一次应用的尺寸矩阵');
  }

  function applyPresetTemplate(template: PresetTemplate, mode: PresetApplyMode) {
    const presetText = serializePresetSpecs(template.specs);
    setDraftText((current) => (mode === 'replace' ? presetText : mergeSpecText(current, presetText)));
    setMessage(`已${mode === 'replace' ? '填入' : '追加'}套组：${template.name}`);
  }

  function saveCurrentAsPreset() {
    if (!specs.length) {
      setMessage('当前没有可保存的尺寸套组');
      return;
    }
    const name = newPresetName.trim() || `我的套组 ${customPresets.length + 1}`;
    const nextPreset: PresetTemplate = {
      id: `custom_${crypto.randomUUID()}`,
      name,
      description: `保存于 ${new Date().toLocaleDateString('zh-CN')}`,
      specs: toPresetSpecs(specs)
    };
    setCustomPresets((previous) => [nextPreset, ...previous]);
    setNewPresetName('');
    setMessage(`已保存套组：${name}`);
  }

  function removeCustomPreset(id: string) {
    const preset = customPresets.find((item) => item.id === id);
    if (!preset) return;
    setPendingConfirmation({ type: 'delete-preset', presetId: id, presetName: preset.name });
  }

  function confirmPendingAction() {
    if (!pendingConfirmation) return;
    if (pendingConfirmation.type === 'apply-specs') {
      commitParsedSpecs();
    } else if (pendingConfirmation.type === 'delete-preset') {
      setCustomPresets((previous) => previous.filter((preset) => preset.id !== pendingConfirmation.presetId));
      setMessage(`已删除套组：${pendingConfirmation.presetName}`);
    } else {
      deleteAsset(pendingConfirmation.assetId);
    }
    setPendingConfirmation(undefined);
  }

  function selectBoard(assetId: string, specId: string) {
    setSelectedAssetId(assetId);
    setSelectedSpecId(specId);
  }

  function selectAssetAndScroll(assetId: string) {
    setSelectedAssetId(assetId);
    requestAnimationFrame(() => {
      document.getElementById(`asset-board-group-${assetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function requestDeleteAsset(assetId: string) {
    const asset = assets.find((item) => item.id === assetId);
    if (asset) setPendingConfirmation({ type: 'delete-asset', assetId, fileName: asset.fileName });
  }

  function deleteAsset(assetId: string) {
    const index = assets.findIndex((asset) => asset.id === assetId);
    if (index < 0) return;
    const removed = assets[index];
    const replacement = assets[index + 1] ?? assets[index - 1];
    URL.revokeObjectURL(removed.objectUrl);
    setAssets((previous) => previous.filter((asset) => asset.id !== assetId));
    setPreviewStates((previous) => Object.fromEntries(Object.entries(previous).filter(([, state]) => state.assetId !== assetId)));
    dispatchBoardBrand({ type: 'remove-asset', assetId });
    if (focusAssetId === assetId) closeFocusEditor();
    if (selectedAssetId === assetId) setSelectedAssetId(replacement?.id);
    setMessage(`已删除素材：${removed.fileName}`);
  }

  function openFocusEditor(assetId: string, specId: string) {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedAssetId(assetId);
    setSelectedSpecId(specId);
    setFocusAssetId(assetId);
    setFocusSpecId(specId);
  }

  function closeFocusEditor() {
    setFocusAssetId(undefined);
    setFocusSpecId(undefined);
    requestAnimationFrame(() => focusReturnRef.current?.focus());
  }

  function saveFocusPreview(nextPreviewState: BoardPreviewState, nextLogoGroup: LogoGroupState, nextCprState: CprState) {
    const key = getBoardPreviewKey(nextPreviewState.assetId, nextPreviewState.specId);
    setPreviewStates((previous) => updateBoardCrop(previous, nextPreviewState));
    dispatchBoardBrand({ type: 'update-logo', key, logo: nextLogoGroup });
    dispatchBoardBrand({ type: 'update-cpr', key, cpr: nextCprState });
    setSelectedAssetId(nextPreviewState.assetId);
    setSelectedSpecId(nextPreviewState.specId);
    closeFocusEditor();
    setMessage('已保存当前画板调整');
  }

  function applyLogoGroupToSameAspect(nextLogoGroup: LogoGroupState) {
    if (!focusSpec) return;
    const family = classifyAspect({ width: focusSpec.width, height: focusSpec.height });
    const matchingKeys = assets.flatMap((asset) =>
      specs
        .filter((spec) => classifyAspect({ width: spec.width, height: spec.height }) === family)
        .map((spec) => getBoardPreviewKey(asset.id, spec.id))
    );
    const source = boardBrandStates[focusPreviewKey ?? ''];
    if (source) dispatchBoardBrand({ type: 'apply-brand', keys: matchingKeys, source: { ...source, logo: nextLogoGroup } });
    setMessage(`已将品牌位置应用到 ${matchingKeys.length} 个${family === 'landscape' ? '横版' : family === 'portrait' ? '竖版' : '方图'}画板`);
  }

  function changeBrandLanguage(language: BrandLanguage) {
    const selectedId = resolvePreferredBrandAssetId(brandAssets, 'logo', language, brandLayer.selectedLogoId);
    setBrandLayer((previous) => ({
      ...previous,
      logoLanguage: language,
      selectedLogoId: selectedId
    }));
    if (selectedBoardKey) {
      dispatchBoardBrand({ type: 'update-logo', key: selectedBoardKey, logo: { ...normalizeLogoGroup(boardBrandStates[selectedBoardKey]?.logo ?? defaultLogoGroup), gameLogoLanguage: language, gameLogoId: selectedId } });
    }
  }

  async function handleLogoFiles(fileList: FileList | null, language = brandLayer.logoLanguage) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setMessage('正在读取 SVG 资源...');
    try {
      const nextAssets = await Promise.all(files.map((file) => createBrandAssetFromFile(file, 'logo', language)));
      setBrandAssets((previous) => [
        ...previous.filter((asset) => replacingResourceId
          ? asset.id !== replacingResourceId
          : !(asset.type === 'logo' && asset.language === language)),
        ...nextAssets
      ]);
      setBrandLayer((previous) => ({
        ...previous,
        selectedLogoId: language === 'custom' ? previous.selectedLogoId : nextAssets[0]?.id ?? previous.selectedLogoId
      }));
      if (language === 'custom' && nextAssets[0]) {
        for (const [key, state] of Object.entries(boardBrandStates)) dispatchBoardBrand({ type: 'update-logo', key, logo: { ...normalizeLogoGroup(state.logo), companyLogoId: nextAssets[0]!.id } });
      }
      setMessage(`已导入 ${nextAssets.length} 个 Logo SVG`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SVG 导入失败');
    } finally {
      setReplacingResourceId(undefined);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  return (
    <>
    <AppShell activeModule={activeModule} onModuleChange={setActiveModule} activity={createAppActivity({ exporting, focusEditorOpen: Boolean(focusAsset && focusSpec), focusEditorDirty, customWorkbenchDirty, settingsDialogOpen, settingsDirty, confirmationDialogOpen: Boolean(pendingConfirmation) })} header={<WorkbenchHeader
        assetCount={assets.length}
        boardCount={specs.length}
        previewCount={Object.keys(workbenchState.previewStates).length}
        hasPendingSpecChanges={hasPendingSpecChanges}
        onOpenSettings={() => setSettingsDialogOpen(true)}
      />}>
      {activeModule === 'media' ? <section className="workspace">
        <AssetSidebar>
          <div className="panel-heading">
            <h2>素材</h2>
            <button type="button" onClick={() => imageInputRef.current?.click()}>
              导入图片
            </button>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(event) => void handleImageFiles(event.target.files)}
          />
          <div className="asset-list">
            {assets.length === 0 ? (
              <div className="drop-zone" onClick={() => imageInputRef.current?.click()}>
                <strong>上传主视觉 / 已设计图</strong>
                <span>支持一次选择多张图片，本地读取尺寸与缩略图。</span>
              </div>
            ) : (
              assets.map((asset) => (
                <div
                  key={asset.id}
                  className={`asset-row ${asset.id === selectedAsset?.id ? 'active' : ''}`}
                >
                  <button type="button" className="asset-select-button" onClick={() => selectAssetAndScroll(asset.id)}>
                    <img src={asset.objectUrl} alt={asset.fileName} />
                    <span>
                      <strong>{asset.fileName}</strong>
                      <small>{asset.width} x {asset.height} · {formatFileSize(asset.fileSize)}</small>
                    </span>
                  </button>
                  <button type="button" className="asset-delete-button icon-button" onClick={(event) => { event.stopPropagation(); requestDeleteAsset(asset.id); }} aria-label={`删除素材 ${asset.fileName}`} title="删除素材">×</button>
                </div>
              ))
            )}
          </div>
          {importFailures.length ? <div className="import-failures"><strong>失败文件</strong>{importFailures.map((failure) => <small key={failure}>{failure}</small>)}</div> : null}

          <BrandControlsPanel
            logoGroup={selectedLogoGroup}
            cprState={selectedCprState}
            brandLayer={brandLayer}
            brandSettings={brandSettings}
            gameLogoAsset={gameLogoAsset}
            onLanguageChange={changeBrandLanguage}
            onLogoChange={(next) => { if (selectedBoardKey) dispatchBoardBrand({ type: 'update-logo', key: selectedBoardKey, logo: next }); }}
            onCprChange={(next) => { if (selectedBoardKey) dispatchBoardBrand({ type: 'update-cpr', key: selectedBoardKey, cpr: next }); }}
            onBrandLayerChange={setBrandLayer}
            onSettingsChange={(next) => { setBrandSettings(next); saveBrandSettings(next); }}
          />
        </AssetSidebar>

        <BoardOverview disabled={!assets.length || !specs.length} onExport={() => setExportDialogOpen(true)} message={message}>
          <MultiAssetBoardOverview
            assets={assets}
            specs={specs}
            previewStates={previewStates}
            selectedAssetId={selectedAsset?.id}
            selectedSpecId={selectedSpec?.id}
            logoAsset={selectedLogo}
            cprAsset={selectedCpr}
            brandLayer={brandLayer}
            brandSettings={brandSettings}
            boardBrandStates={boardBrandStates}
            companyLogo={companyLogoAsset}
            gameLogo={gameLogoAsset}
            onSelect={selectBoard}
            onEdit={openFocusEditor}
            onDelete={requestDeleteAsset}
          />
        </BoardOverview>

        <SpecPanel boardCount={specs.length}>
          <div className="preset-section">
            <div className="preset-list">
              {PRESET_TEMPLATES.map((preset) => (
                <button key={preset.id} type="button" className="preset-card" onClick={() => applyPresetTemplate(preset, presetApplyMode)}>
                  <strong>{preset.name}</strong>
                  <small>{preset.description}</small>
                  <span>{preset.specs.length} 个尺寸</span>
                </button>
              ))}
            </div>
            <div className="custom-preset-editor">
              <input
                type="text"
                value={newPresetName}
                onChange={(event) => setNewPresetName(event.target.value)}
                placeholder="把当前画板保存成常用套组"
              />
              <button type="button" onClick={saveCurrentAsPreset} disabled={!specs.length}>
                保存当前套组
              </button>
            </div>
            {customPresets.length > 0 ? (
              <div className="custom-preset-list">
                {customPresets.map((preset) => (
                  <div key={preset.id} className="custom-preset-row">
                    <button type="button" className="preset-card custom" onClick={() => applyPresetTemplate(preset, presetApplyMode)}>
                      <strong>{preset.name}</strong>
                      <small>{preset.description}</small>
                      <span>{preset.specs.length} 个尺寸</span>
                    </button>
                    <button type="button" className="danger-button" onClick={() => removeCustomPreset(preset.id)}>
                      删除
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="spec-editor">
            <div className="spec-editor-header">
              <span>输入尺寸</span>
              <div className="segmented-control" aria-label="套组填入方式">
                <button
                  type="button"
                  className={presetApplyMode === 'replace' ? 'active' : ''}
                  onClick={() => setPresetApplyMode('replace')}
                >
                  替换填入
                </button>
                <button
                  type="button"
                  className={presetApplyMode === 'append' ? 'active' : ''}
                  onClick={() => setPresetApplyMode('append')}
                >
                  追加到末尾
                </button>
              </div>
            </div>
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              placeholder="粘贴尺寸片段，例如 1080x1920、1920*1080、16:9 1920"
              spellCheck={false}
            />
          </div>
          <div className="toolbar-line text-actions">
            <button type="button" onClick={applyParsedSpecs} disabled={!hasPendingSpecChanges}>
              应用尺寸
            </button>
            <button type="button" onClick={restoreAppliedText} disabled={!hasPendingSpecChanges}>
              恢复已应用
            </button>
            <span className="inline-note">
              解析 {result.specs.length} 个画板
              {result.unrecognizedLines.length ? ` · ${result.unrecognizedLines.length} 行未识别` : ''}
            </span>
          </div>
          {selectedSpec && (
            <div className="current-board">
              <strong>当前画板</strong>
              <span>{selectedSpec.width} x {selectedSpec.height}</span>
              <span>{selectedSpec.format.toUpperCase()} · {getAspectLabel(selectedSpec)}</span>
              {selectedSpec.maxSizeKb ? <span>大小限制 {selectedSpec.maxSizeKb} KB</span> : <span>未设置大小限制</span>}
            </div>
          )}
          <div className="spec-list">
            {specs.map((spec, index) => (
              <button
                key={spec.id}
                type="button"
                className={`spec-row ${spec.id === selectedSpec?.id ? 'active' : ''}`}
                onClick={() => selectedAsset && selectBoard(selectedAsset.id, spec.id)}
                onDoubleClick={() => selectedAsset && openFocusEditor(selectedAsset.id, spec.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (selectedAsset) openFocusEditor(selectedAsset.id, spec.id);
                  }
                }}
                title="双击进入画板调整"
              >
                <span>
                  <strong>{spec.name}</strong>
                  <small>{spec.width} x {spec.height} · {spec.format.toUpperCase()} · {getAspectLabel(spec)}</small>
                </span>
                <code>{buildOutputFileName(spec, { batchName: 'demo', sourceName: selectedAsset?.fileName, index })}</code>
              </button>
            ))}
          </div>
          {result.unrecognizedLines.length > 0 && (
            <div className="warning-box">
              <strong>未识别行</strong>
              {result.unrecognizedLines.map((line) => (
                <span key={`${line.lineNumber}-${line.text}`}>第 {line.lineNumber} 行：{line.text}</span>
              ))}
            </div>
          )}
        </SpecPanel>
      </section> : activeModule === 'custom' ? <CustomWorkbench brandLayer={brandLayer} logoAsset={selectedLogo} cprAsset={selectedCpr} companyLogo={companyLogoAsset} gameLogo={gameLogoAsset} gameLogos={logoAssets.filter((asset) => asset.language !== 'custom')} onDirtyChange={setCustomWorkbenchDirty} /> : <GifCompressorPlaceholder />}
      </AppShell>
      {focusAsset && focusSpec && (
        <FocusEditorModal
          key={`${focusAsset.id}:${focusSpec.id}`}
          asset={focusAsset}
          spec={focusSpec}
          previewState={focusPreviewState}
          logoAsset={selectedLogo}
          cprAsset={selectedCpr}
          brandLayer={brandLayer}
          brandSettings={brandSettings}
          logoGroup={focusPreviewKey ? boardBrandStates[focusPreviewKey]?.logo ?? defaultLogoGroup : defaultLogoGroup}
          cprState={focusPreviewKey ? boardBrandStates[focusPreviewKey]?.cpr ?? defaultCprState : defaultCprState}
          overlayCompanyLogo={companyLogoAsset}
          overlayGameLogo={gameLogoAsset}
          onCancel={closeFocusEditor}
          onSave={saveFocusPreview}
          onApplyToSameAspect={applyLogoGroupToSameAspect}
          onDirtyChange={setFocusEditorDirty}
        />
      )}
      {pendingConfirmation && (
        <ConfirmationDialog
          title={pendingConfirmation.type === 'apply-specs' ? '更新尺寸矩阵' : pendingConfirmation.type === 'delete-asset' ? '删除素材' : '删除常用套组'}
          message={
            pendingConfirmation.type === 'apply-specs'
              ? `将更新为 ${pendingConfirmation.count} 个画板。同规格裁切会尽量保留，已删除规格的状态会被移除。`
              : pendingConfirmation.type === 'delete-asset'
                ? `删除“${pendingConfirmation.fileName}”后，它对应的所有画板裁切和品牌位置调整也会被移除，且无法恢复。`
                : `确定删除“${pendingConfirmation.presetName}”吗？删除后无法恢复。`
          }
          confirmLabel={pendingConfirmation.type === 'apply-specs' ? '确认更新' : '确认删除'}
          destructive={pendingConfirmation.type !== 'apply-specs'}
          onCancel={() => setPendingConfirmation(undefined)}
          onConfirm={confirmPendingAction}
        />
      )}
      {exportDialogOpen && (
        <BatchExportDialog
          assets={assets}
          specs={specs}
          previewStates={previewStates}
          brandAssets={brandAssets}
          brandLayer={brandLayer}
          boardBrandStates={boardBrandStates}
          onClose={() => setExportDialogOpen(false)}
          onComplete={setMessage}
          onExportingChange={setExporting}
        />
      )}
      {settingsDialogOpen && (
        <BrandSettingsDialog
          settings={brandSettings}
          assets={brandAssets}
          selectedLogoId={brandLayer.selectedLogoId}
          selectedCompanyLogoId={selectedLogoGroup.companyLogoId}
          onSelectResource={(asset) => {
            if (asset.language !== 'custom') setBrandLayer((previous) => ({ ...previous, logoLanguage: asset.language, selectedLogoId: asset.id }));
          }}
          onReplaceResource={(asset, language) => {
            setReplacingResourceId(asset?.id);
            setResourceUploadLanguage(language);
            logoInputRef.current?.click();
          }}
          onRestoreResources={() => { setBrandAssets(DEFAULT_BRAND_ASSETS); setMessage('已恢复内置品牌资源'); }}
          onDirtyChange={setSettingsDirty}
          onClose={() => setSettingsDialogOpen(false)}
          onChange={(next) => { setBrandSettings(next); saveBrandSettings(next); }}
        />
      )}
      <input ref={logoInputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(event) => void handleLogoFiles(event.target.files, resourceUploadLanguage)} />
    </>
  );
}
