import { useEffect, useMemo, useRef } from 'react';
import {
  BRAND_LANGUAGE_OPTIONS,
  PRESET_TEMPLATES,
  buildOutputFileName,
  classifyAspect,
  createDefaultCprState,
  normalizeLogoGroup,
  createInitialCropState,
  formatFileSize,
  getBoardPreviewKey,
  parseSpecText,
  resolveBoardBrandAssets,
  saveCustomPresetTemplates,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLanguage,
  type BrandLayerState,
  type BrandSettingsV1,
  type CprState,
  type FitMode,
  type LogoGroupState,
  type MaterialAsset,
  type MaterialSpec,
  type MaterialFormat,
  type WorkbenchState
} from '../../core';
import {
  AssetSidebar,
  BoardOverview,
  MultiAssetBoardOverview,
  SpecPanel
} from '../../components';
import { useAppRuntime } from '../../app/AppRuntimeProvider';
import { BatchExportDialog } from '../../modules/media-workbench/BatchExportDialog';
import { FocusWorkspace } from './FocusWorkspace';
import { ConfirmationDialog } from './ConfirmationDialog';
import { BrandControlsPanel } from './BrandControlsPanel';
import { selectBoardBrandState, selectBoardKey, selectBoardPreviewState } from './mediaWorkbenchSelectors';
import { updateBoardCrop } from './mediaWorkbenchActions';
import { useMediaWorkbenchState } from './useMediaWorkbenchState';
import { useMediaAssetActions } from './useMediaAssetActions';
import { useMediaSpecActions } from './useMediaSpecActions';
import { useMediaBrandActions } from './useMediaBrandActions';
import { createFocusSession, updateFocusCpr, updateFocusLogo } from './focusSession';

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

export function MediaWorkbench({ active }: { active: boolean }) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const assetsRef = useRef<MaterialAsset[]>([]);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const { brandAssets, brandLayer, setBrandLayer, brandSettings, setBrandSettings, updateActivity, setMediaHeader, registerGlobalBrandResourceHandlers, setSettingsSelectedCompanyLogoId } = useAppRuntime();
  const { draftText, setDraftText, appliedText, setAppliedText, specs, setSpecs, assets, setAssets, selectedAssetId, setSelectedAssetId, selectedSpecId, setSelectedSpecId, previewStates, setPreviewStates, boardBrandStates, dispatchBoardBrand, customPresets, setCustomPresets, presetApplyMode, setPresetApplyMode, focusAssetId, setFocusAssetId, focusSpecId, setFocusSpecId, focusSession, setFocusSession, focusEditorDirty, setFocusEditorDirty, pendingConfirmation, setPendingConfirmation, newPresetName, setNewPresetName, exportDialogOpen, setExportDialogOpen, exporting, setExporting, message, setMessage, importFailures, setImportFailures } = useMediaWorkbenchState();

  const result = useMemo(() => parseSpecText(draftText), [draftText]);
  const hasPendingSpecChanges = draftText.trim() !== appliedText.trim();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const selectedSpec = specs.find((spec) => spec.id === selectedSpecId) ?? specs[0];
  const selectedBoardKey = selectBoardKey(selectedAsset, selectedSpec);
  const defaultLogoGroup = useMemo(() => createLogoGroupFromSettings(brandSettings), [brandSettings]);
  const defaultCprState = useMemo<CprState>(() => ({
    ...createDefaultCprState(),
    enabled: brandSettings.cprEnabled,
    scale: 1,
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
  const selectedCprState = selectBoardBrandState(boardBrandStates, selectedBoardKey)?.cpr ?? defaultCprState;
  const selectedBoardBrandState = selectBoardBrandState(boardBrandStates, selectedBoardKey) ?? { logo: selectedLogoGroup, cpr: selectedCprState };
  const selectedBoardAssets = resolveBoardBrandAssets({ boardBrandState: selectedBoardBrandState, brandCatalog: brandAssets, brandLayer });
  const focusLogoGroup = focusPreviewKey ? boardBrandStates[focusPreviewKey]?.logo ?? defaultLogoGroup : defaultLogoGroup;
  const focusCprState = focusPreviewKey ? boardBrandStates[focusPreviewKey]?.cpr ?? defaultCprState : defaultCprState;
  const focusBoardAssets = resolveBoardBrandAssets({
    boardBrandState: { logo: focusLogoGroup, cpr: focusCprState },
    brandCatalog: brandAssets,
    brandLayer
  });

  useEffect(() => {
    if (!focusAsset || !focusSpec || !focusPreviewKey || !focusPreviewState || focusSession?.boardKey === focusPreviewKey) return;
    const brand = boardBrandStates[focusPreviewKey] ?? { logo: focusLogoGroup, cpr: focusCprState };
    setFocusSession(createFocusSession(focusAsset.id, focusSpec.id, focusPreviewKey, { previewState: focusPreviewState, brand }));
  }, [boardBrandStates, focusAsset, focusCprState, focusLogoGroup, focusPreviewKey, focusPreviewState, focusSession?.boardKey, focusSpec, setFocusSession]);

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
    setMediaHeader({ assetCount: assets.length, boardCount: specs.length, previewCount: Object.keys(previewStates).length, hasPendingSpecChanges });
  }, [assets.length, hasPendingSpecChanges, previewStates, setMediaHeader, specs.length]);

  useEffect(() => {
    setSettingsSelectedCompanyLogoId(selectedLogoGroup.companyLogoId);
  }, [selectedLogoGroup.companyLogoId, setSettingsSelectedCompanyLogoId]);

  useEffect(() => {
    updateActivity({
      exporting,
      focusEditorOpen: Boolean(focusAsset && focusSpec),
      focusEditorDirty,
      confirmationDialogOpen: Boolean(pendingConfirmation)
    });
    return () => updateActivity({ exporting: false, focusEditorOpen: false, focusEditorDirty: false, confirmationDialogOpen: false });
  }, [exporting, focusAsset, focusSpec, focusEditorDirty, pendingConfirmation, updateActivity]);

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

  const { handleImageFiles, selectBoard, selectAssetAndScroll, requestDeleteAsset, deleteAsset, openFocusEditor, closeFocusEditor } = useMediaAssetActions({ assets, selectedAssetId, focusAssetId, imageInputRef, focusReturnRef, setAssets, setSelectedAssetId, setSelectedSpecId, setPreviewStates, setFocusAssetId, setFocusSpecId, setImportFailures, setMessage, setPendingConfirmation, dispatchBoardBrand });
  const { applyParsedSpecs, restoreAppliedText, applyPresetTemplate, saveCurrentAsPreset, removeCustomPreset, confirmPendingAction } = useMediaSpecActions({ result, draftText, appliedText, specs, previewStates, brandSettings, customPresets, newPresetName, pendingConfirmation, setDraftText, setAppliedText, setSpecs, setBrandLayer, setCustomPresets, setNewPresetName, setPendingConfirmation, setMessage, createLogoDefaults: (spec) => createLogoGroupFromSettings(brandSettings, spec), deleteAsset });
  const { changeBrandLanguage, applyCompanyLogoReplacement } = useMediaBrandActions({ assets, specs, boardBrandStates, brandAssets, brandLayer, selectedBoardKey, focusSpec, focusPreviewKey, defaultLogoGroup, setPreviewStates, dispatchBoardBrand, setBrandLayer, setSelectedAssetId, setSelectedSpecId, setMessage });

  function closeFocusSession() {
    setFocusSession(undefined);
    closeFocusEditor();
  }

  function commitFocusSession(session: NonNullable<typeof focusSession>) {
    setPreviewStates((previous) => updateBoardCrop(previous, session.draft.previewState));
    dispatchBoardBrand({ type: 'update-logo', key: session.boardKey, logo: session.draft.brand.logo });
    dispatchBoardBrand({ type: 'update-cpr', key: session.boardKey, cpr: session.draft.brand.cpr });
    setSelectedAssetId(session.assetId);
    setSelectedSpecId(session.specId);
    setMessage('已保存当前画板调整');
    closeFocusSession();
  }

  function updateFocusedLanguage(language: BrandLanguage) {
    if (!focusSession) return changeBrandLanguage(language);
    const gameLogo = brandAssets.find((asset) => asset.type === 'logo' && asset.language === language);
    setFocusSession(updateFocusLogo(focusSession, { ...focusSession.draft.brand.logo, gameLogoLanguage: language, gameLogoId: gameLogo?.id }));
  }

  function sameAspectKeys() {
    const sourceSpec = focusSession ? focusSpec : selectedSpec;
    if (!sourceSpec) return [];
    const family = classifyAspect({ width: sourceSpec.width, height: sourceSpec.height });
    return assets.flatMap((asset) => specs
      .filter((spec) => classifyAspect({ width: spec.width, height: spec.height }) === family)
      .map((spec) => getBoardPreviewKey(asset.id, spec.id)));
  }

  function applyLogoToSameAspect() {
    const logo = focusSession?.draft.brand.logo ?? selectedLogoGroup;
    dispatchBoardBrand({ type: 'apply-logo-to-same-aspect', keys: sameAspectKeys(), logo });
  }

  function applyCprToSameAspect() {
    const cpr = focusSession?.draft.brand.cpr ?? selectedCprState;
    dispatchBoardBrand({ type: 'apply-cpr-to-same-aspect', keys: sameAspectKeys(), cpr });
  }

  function applyLogoToAll() {
    dispatchBoardBrand({ type: 'apply-logo-to-all', logo: focusSession?.draft.brand.logo ?? selectedLogoGroup });
  }

  function applyCprToAll() {
    dispatchBoardBrand({ type: 'apply-cpr-to-all', cpr: focusSession?.draft.brand.cpr ?? selectedCprState });
  }

  const brandControls = <BrandControlsPanel
    logoGroup={focusSession?.draft.brand.logo ?? selectedLogoGroup}
    cprState={focusSession?.draft.brand.cpr ?? selectedCprState}
    brandLayer={brandLayer}
    brandSettings={brandSettings}
    gameLogoAsset={focusSession ? focusBoardAssets.gameLogo : selectedBoardAssets.gameLogo}
    onLanguageChange={updateFocusedLanguage}
    onLogoChange={(next) => { if (focusSession) setFocusSession(updateFocusLogo(focusSession, next)); else if (selectedBoardKey) dispatchBoardBrand({ type: 'update-logo', key: selectedBoardKey, logo: next }); }}
    onCprChange={(next) => { if (focusSession) setFocusSession(updateFocusCpr(focusSession, next)); else if (selectedBoardKey) dispatchBoardBrand({ type: 'update-cpr', key: selectedBoardKey, cpr: next }); }}
    onBrandLayerChange={setBrandLayer}
    onSettingsChange={setBrandSettings}
    onApplyLogoSameAspect={focusSession ? undefined : applyLogoToSameAspect}
    onApplyLogoAll={focusSession ? undefined : applyLogoToAll}
    onApplyCprSameAspect={focusSession ? undefined : applyCprToSameAspect}
    onApplyCprAll={focusSession ? undefined : applyCprToAll}
  />;

  useEffect(() => registerGlobalBrandResourceHandlers({
    onCompanyLogoReplacement: applyCompanyLogoReplacement,
    onMessage: setMessage
  }), [applyCompanyLogoReplacement, registerGlobalBrandResourceHandlers, setMessage]);

  return (
    <>
      {active && !focusSession ? <section className="workspace">
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

          {brandControls}
        </AssetSidebar>

        <BoardOverview disabled={!assets.length || !specs.length} onExport={() => setExportDialogOpen(true)} message={message}>
          <MultiAssetBoardOverview
            assets={assets}
            specs={specs}
            previewStates={previewStates}
            selectedAssetId={selectedAsset?.id}
            selectedSpecId={selectedSpec?.id}
            brandCatalog={brandAssets}
            brandLayer={brandLayer}
            brandSettings={brandSettings}
            boardBrandStates={boardBrandStates}
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
      </section> : null}
      {focusAsset && focusSpec && focusSession ? (
        <FocusWorkspace
          asset={focusAsset}
          spec={focusSpec}
          session={focusSession}
          brandCatalog={brandAssets}
          brandLayer={brandLayer}
          brandSettings={brandSettings}
          brandControls={brandControls}
          onSessionChange={(session) => { setFocusSession(session); setFocusEditorDirty(session.dirty); }}
          onCancel={closeFocusSession}
          onCommit={commitFocusSession}
        />
      ) : null}
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
    </>
  );
}
