import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BRAND_LANGUAGE_OPTIONS,
  PRESET_TEMPLATES,
  buildBoardRenderPlan,
  createBatchExportItems,
  DEFAULT_BRAND_ASSETS,
  DEFAULT_BRAND_SETTINGS,
  DEFAULT_CPR_EFFECT,
  DEFAULT_LOGO_EFFECT,
  buildOutputFileName,
  classifyAspect,
  clampCropState,
  computeFitScale,
  createBrandAssetFromFile,
  createDefaultLogoGroup,
  createInitialCropState,
  createMaterialAsset,
  exportBoardImage,
  estimateExportBytes,
  formatFileSize,
  formatMegabytes,
  getBoardPreviewKey,
  getBrandLanguageLabel,
  loadBrandSettings,
  loadCustomPresetTemplates,
  panCropState,
  parseSpecText,
  saveBrandSettings,
  saveCustomPresetTemplates,
  serializePresetSpecs,
  toPresetSpecs,
  zoomCropState,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLanguage,
  type BrandLayerState,
  type BrandSettingsV1,
  type CropState,
  type FitMode,
  type LogoGroupState,
  type MaterialAsset,
  type MaterialSpec,
  type MaterialFormat,
  type PresetTemplate,
  type WorkbenchState
} from '../core';
import { chooseOutputTarget, downloadBlobFile, saveBlobToDirectory } from '../platform/fileSystem';
import {
  AssetSidebar,
  BoardOverview,
  BrandAssetList,
  BrandEffectControls,
  BrandGuideControls,
  BrandPanel,
  BrandSettingsDialog,
  ExportDialog,
  FocusEditor,
  LogoGroupControls,
  SpecPanel,
  WorkbenchHeader
} from '../components';
import { BoardCanvas } from '../components/canvas';

const DEFAULT_BRAND_LAYER: BrandLayerState = {
  logoEnabled: true,
  cprEnabled: false,
  logoLanguage: 'zh-CN',
  cprLanguage: 'zh-CN',
  logoAnchor: 'top-right',
  cprAnchor: 'center',
  logoSize: 'standard',
  cprSize: 'standard',
  logoEffect: DEFAULT_LOGO_EFFECT,
  cprEffect: DEFAULT_CPR_EFFECT
};

type PresetApplyMode = 'replace' | 'append';

type PendingConfirmation =
  | { type: 'apply-specs'; count: number }
  | { type: 'delete-preset'; presetId: string; presetName: string };

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

function PreviewStage({
  asset,
  specs,
  selectedSpecId,
  previewStates,
  logoAsset,
  cprAsset,
  brandLayer,
  brandSettings,
  logoGroup,
  overlayCompanyLogo,
  overlayGameLogo,
  onSelectSpec,
  onEditSpec
}: {
  asset: MaterialAsset | undefined;
  specs: MaterialSpec[];
  selectedSpecId: string | undefined;
  previewStates: Record<string, BoardPreviewState>;
  logoAsset: BrandAsset | undefined;
  cprAsset: BrandAsset | undefined;
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  logoGroup: LogoGroupState;
  overlayCompanyLogo?: BrandAsset;
  overlayGameLogo?: BrandAsset;
  onSelectSpec: (specId: string) => void;
  onEditSpec: (specId: string) => void;
}) {
  const selectedSpec = specs.find((spec) => spec.id === selectedSpecId) ?? specs[0];

  if (!specs.length) {
    return <div className="empty-state">粘贴尺寸后会生成画板；上传图片后可在这里逐尺寸预览。</div>;
  }

  return (
    <div className="preview-shell">
      <div className="preview-meta">
          <span>总览 {specs.length} 个画板 · 单击选择，双击调整</span>
        {selectedSpec && (
          <span>
            当前 {selectedSpec.width} x {selectedSpec.height} · {getAspectLabel(selectedSpec)}
          </span>
        )}
      </div>

      <div className="board-overview">
        {specs.map((spec) => {
          const key = asset ? getBoardPreviewKey(asset.id, spec.id) : undefined;
          const previewState = key ? previewStates[key] : undefined;
          const isSelected = spec.id === selectedSpec?.id;
          const scale = Math.min(220 / spec.width, 160 / spec.height, 1);

          return (
            <article key={spec.id} className={`board-card ${isSelected ? 'active' : ''}`}>
              <button
                type="button"
                className="board-card-button"
                onClick={() => onSelectSpec(spec.id)}
                onDoubleClick={() => onEditSpec(spec.id)}
                onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onEditSpec(spec.id);
                  }
                }}
                aria-pressed={isSelected}
                aria-label={`${spec.name} ${spec.width} x ${spec.height}，双击调整`}
              >
                <div className="board-card-title">
                  <strong>{spec.name}</strong>
                  <small>{spec.width} x {spec.height}</small>
                </div>
                <BoardCanvas
                  asset={asset}
                  spec={spec}
                  previewState={previewState}
                  logoAsset={logoAsset}
                  cprAsset={cprAsset}
                  brandLayer={brandLayer}
                  scale={scale}
                  brandSettings={brandSettings}
                  logoGroup={logoGroup}
                  overlayCompanyLogo={overlayCompanyLogo}
                  overlayGameLogo={overlayGameLogo}
                />
                <div className="board-card-footer">
                  <span>{getAspectLabel(spec)}</span>
                  <span>{previewState?.fitMode === 'contain' ? '适应 · 双击调整' : '填满 · 双击调整'}</span>
                </div>
              </button>
            </article>
          );
        })}
      </div>

    </div>
  );
}

function FocusEditorModal({
  asset,
  spec,
  previewState,
  logoAsset,
  cprAsset,
  brandLayer,
  brandSettings,
  logoGroup,
  overlayCompanyLogo,
  overlayGameLogo,
  onCancel,
  onSave
}: {
  asset: MaterialAsset | undefined;
  spec: MaterialSpec;
  previewState: BoardPreviewState | undefined;
  logoAsset: BrandAsset | undefined;
  cprAsset: BrandAsset | undefined;
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  logoGroup: LogoGroupState;
  overlayCompanyLogo?: BrandAsset;
  overlayGameLogo?: BrandAsset;
  onCancel: () => void;
  onSave: (previewState: BoardPreviewState) => void;
}) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const initialState = previewState ?? (asset ? createPreviewState(asset, spec, 'cover') : undefined);
  const [draftState, setDraftState] = useState<BoardPreviewState | undefined>(initialState);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const crop = draftState?.crop;
  const coverScale = asset ? computeFitScale(asset, spec, 'cover') : 1;
  const containScale = asset ? computeFitScale(asset, spec, 'contain') : coverScale;
  const sliderMinScale = draftState?.fitMode === 'contain' ? containScale : coverScale;
  const maxScale = Math.max(coverScale, sliderMinScale) * 6;
  const compactDialog = typeof window !== 'undefined' && window.innerWidth <= 900;
  const stageMaxWidth = compactDialog ? Math.max(280, window.innerWidth - 100) : 820;
  const stageMaxHeight = compactDialog ? Math.max(260, Math.min(420, window.innerHeight - 380)) : 560;
  const stageScale = Math.min(stageMaxWidth / spec.width, stageMaxHeight / spec.height, 1.6);
  const dirty = Boolean(initialState && draftState && (
    initialState.fitMode !== draftState.fitMode ||
    initialState.crop.scale !== draftState.crop.scale ||
    initialState.crop.offsetX !== draftState.crop.offsetX ||
    initialState.crop.offsetY !== draftState.crop.offsetY
  ));

  function updateCrop(nextCrop: CropState) {
    if (!asset || !draftState) return;
    setDraftState({
      ...draftState,
      crop: clampCropState(asset, spec, nextCrop, draftState.fitMode)
    });
  }

  function setFitMode(mode: FitMode) {
    if (!asset) return;
    setDraftState(createPreviewState(asset, spec, mode));
  }

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!asset || !draftState) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!asset || !draftState || !dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const deltaX = (event.clientX - dragRef.current.x) / stageScale;
    const deltaY = (event.clientY - dragRef.current.y) / stageScale;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setDraftState({
      ...draftState,
      crop: panCropState(asset, spec, draftState.crop, deltaX, deltaY, draftState.fitMode)
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dirty]);

  return (
    <FocusEditor onBackdropClose={requestClose} labelledBy="focus-dialog-title" describedBy="focus-dialog-help">
      <section ref={dialogRef}>
        <div className="dialog-header">
          <div>
            <span className="dialog-kicker">画板调整</span>
            <h2 id="focus-dialog-title">{spec.name}</h2>
            <small>{spec.width} x {spec.height} · {getAspectLabel(spec)}</small>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={requestClose} aria-label="关闭画板调整" title="关闭">
            ×
          </button>
        </div>

        <div className="focus-dialog-body">
          <div className="focus-stage-frame">
            <BoardCanvas
              asset={asset}
              spec={spec}
              previewState={draftState}
              logoAsset={logoAsset}
              cprAsset={cprAsset}
              brandLayer={brandLayer}
              scale={stageScale}
              draggable={Boolean(asset)}
              brandSettings={brandSettings}
              logoGroup={logoGroup}
              overlayCompanyLogo={overlayCompanyLogo}
              overlayGameLogo={overlayGameLogo}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>

          <div className="focus-side-controls">
            <div>
              <span className="control-label">填充方式</span>
              <div className="segmented-control">
                <button type="button" className={draftState?.fitMode === 'cover' ? 'active' : ''} onClick={() => setFitMode('cover')} disabled={!asset}>
                  填满画布
                </button>
                <button type="button" className={draftState?.fitMode === 'contain' ? 'active' : ''} onClick={() => setFitMode('contain')} disabled={!asset}>
                  适应画布
                </button>
              </div>
            </div>
            <label className="focus-range-field">
              <span className="control-label">缩放</span>
              <input
                type="range"
                min={sliderMinScale}
                max={maxScale}
                step={Math.max(sliderMinScale / 100, 0.001)}
                value={crop?.scale ?? sliderMinScale}
                disabled={!asset || !crop || !draftState}
                onChange={(event) => {
                  if (!asset || !crop || !draftState) return;
                  updateCrop(
                    zoomCropState(
                      asset,
                      spec,
                      crop,
                      Number(event.target.value),
                      { x: spec.width / 2, y: spec.height / 2 },
                      draftState.fitMode
                    )
                  );
                }}
              />
            </label>
            <button type="button" onClick={() => setFitMode(draftState?.fitMode ?? 'cover')} disabled={!asset}>
              重置当前裁切
            </button>
            <p id="focus-dialog-help" className="dialog-help">拖动画面调整位置。这里的修改会在保存后写回当前画板。</p>
          </div>
        </div>

        {confirmDiscard ? (
          <div className="discard-confirm" role="alert">
            <span>当前调整尚未保存，确定放弃吗？</span>
            <button type="button" onClick={() => setConfirmDiscard(false)}>继续调整</button>
            <button type="button" className="danger-button" onClick={onCancel}>放弃修改</button>
          </div>
        ) : (
          <div className="dialog-footer">
            <span>{dirty ? '有未保存的调整' : '当前画板未修改'}</span>
            <div className="dialog-actions">
              <button type="button" onClick={requestClose}>取消</button>
              <button type="button" className="primary-button" onClick={() => draftState && onSave(draftState)} disabled={!draftState || !asset}>
                保存并返回
              </button>
            </div>
          </div>
        )}
      </section>
    </FocusEditor>
  );
}

function ConfirmationDialog({
  title,
  message,
  confirmLabel,
  destructive,
  onCancel,
  onConfirm
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <div className="dialog-header">
          <h2 id="confirm-dialog-title">{title}</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="关闭确认弹窗" title="关闭">×</button>
        </div>
        <p id="confirm-dialog-message">{message}</p>
        <div className="dialog-footer">
          <span />
          <div className="dialog-actions">
            <button type="button" onClick={onCancel} autoFocus>取消</button>
            <button type="button" className={destructive ? 'danger-button' : 'primary-button'} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BatchExportDialog({
  assets,
  specs,
  previewStates,
  brandAssets,
  brandLayer,
  onClose,
  onComplete
}: {
  assets: MaterialAsset[];
  specs: MaterialSpec[];
  previewStates: Record<string, BoardPreviewState>;
  brandAssets: BrandAsset[];
  brandLayer: BrandLayerState;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const items = useMemo(() => createBatchExportItems(assets, specs), [assets, specs]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(items.map((item) => item.id)));
  const [activeItemId, setActiveItemId] = useState(items[0]?.id);
  const [format, setFormat] = useState<MaterialFormat>('png');
  const [quality, setQuality] = useState(0.9);
  const [batchName, setBatchName] = useState('material');
  const [logoEnabled, setLogoEnabled] = useState(brandLayer.logoEnabled);
  const [cprEnabled, setCprEnabled] = useState(brandLayer.cprEnabled);
  const [logoLanguage, setLogoLanguage] = useState(brandLayer.logoLanguage);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');

  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0];
  const activeAsset = assets.find((asset) => asset.id === activeItem?.assetId);
  const activeSpec = specs.find((spec) => spec.id === activeItem?.specId);
  const activePreviewState = activeAsset && activeSpec
    ? previewStates[getBoardPreviewKey(activeAsset.id, activeSpec.id)]
    : undefined;
  const selectedLogoId = resolvePreferredBrandAssetId(brandAssets, 'logo', logoLanguage, brandLayer.selectedLogoId);
  const selectedCprId = resolvePreferredBrandAssetId(brandAssets, 'cpr', 'custom', brandLayer.selectedCprId);
  const exportLogo = brandAssets.find((asset) => asset.id === selectedLogoId);
  const exportCpr = brandAssets.find((asset) => asset.id === selectedCprId);
  const exportBrandLayer: BrandLayerState = {
    ...brandLayer,
    logoEnabled,
    cprEnabled,
    logoLanguage,
    selectedLogoId,
    selectedCprId
  };
  const missingBrandResource = (logoEnabled && !exportLogo) || (cprEnabled && !exportCpr);

  const rows = items.map((item, index) => {
    const asset = assets.find((candidate) => candidate.id === item.assetId);
    const spec = specs.find((candidate) => candidate.id === item.specId);
    if (!asset || !spec) return undefined;
    const estimatedBytes = estimateExportBytes(asset, spec, format, quality);
    const fileName = buildOutputFileName(
      { ...spec, format },
      {
        batchName,
        sourceName: asset.fileName.replace(/\.[^.]+$/g, ''),
        language: logoEnabled ? logoLanguage : undefined,
        index
      }
    );
    return { item, asset, spec, estimatedBytes, fileName };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

  const selectedRows = rows.filter((row) => selectedIds.has(row.item.id));
  const selectedBytes = selectedRows.reduce((total, row) => total + row.estimatedBytes, 0);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !exporting) onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exporting, onClose]);

  function toggleItem(itemId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((row) => row.item.id)));
  }

  async function exportSelectedFiles() {
    if (!selectedRows.length || exporting) return;
    setErrorMessage('');
    const outputTarget = await chooseOutputTarget();
    if (outputTarget.kind === 'cancelled') return;

    setExporting(true);
    setProgress({ current: 0, total: selectedRows.length });
    const failures: string[] = [];
    let completed = 0;

    for (const row of selectedRows) {
      const previewState = previewStates[getBoardPreviewKey(row.asset.id, row.spec.id)];
      if (!previewState) {
        failures.push(`${row.fileName}：缺少画板预览状态`);
        continue;
      }
      try {
        const blob = await exportBoardImage({
          asset: row.asset,
          spec: row.spec,
          previewState,
          brandLayer: exportBrandLayer,
          logoAsset: exportLogo,
          cprAsset: exportCpr,
          companyLogoAsset: brandAssets.find((asset) => asset.id === exportBrandLayer.logoGroup?.companyLogoId) ?? brandAssets.find((asset) => asset.type === 'logo' && asset.language === 'custom'),
          gameLogoAsset: exportLogo,
          format,
          quality
        });
        if (outputTarget.kind === 'directory') {
          await saveBlobToDirectory(outputTarget.handle, row.fileName, blob);
        } else {
          downloadBlobFile(blob, row.fileName);
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
        completed += 1;
      } catch (error) {
        failures.push(`${row.fileName}：${error instanceof Error ? error.message : '导出失败'}`);
      }
      setProgress({ current: completed + failures.length, total: selectedRows.length });
    }

    setExporting(false);
    if (failures.length) {
      setErrorMessage(`已导出 ${completed} 个文件，${failures.length} 个失败。${failures[0]}`);
      return;
    }
    onComplete(`已导出 ${completed} 个文件`);
    onClose();
  }

  const previewScale = activeSpec
    ? Math.min(720 / activeSpec.width, 560 / activeSpec.height, 1)
    : 1;

  return (
    <ExportDialog onClose={onClose} locked={exporting}>
      <section ref={dialogRef}>
        <div className="dialog-header export-dialog-header">
          <div>
            <span className="dialog-kicker">批量导出</span>
            <h2 id="export-dialog-title">导出文件</h2>
            <small>逐张检查并直接写入文件夹，不生成压缩包</small>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={exporting} aria-label="关闭批量导出" title="关闭">×</button>
        </div>

        <div className="export-dialog-body">
          <aside className="export-file-panel">
            <div className="export-column-heading">
              <label className="toggle">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                全选
              </label>
              <span>{selectedRows.length} / {rows.length}</span>
            </div>
            <div className="export-file-list">
              {rows.map((row) => {
                const overLimit = Boolean(row.spec.maxSizeKb && row.estimatedBytes > row.spec.maxSizeKb * 1024);
                return (
                  <div key={row.item.id} className={`export-file-row ${row.item.id === activeItem?.id ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.item.id)}
                      onChange={() => toggleItem(row.item.id)}
                      aria-label={`选择 ${row.fileName}`}
                    />
                    <button type="button" onClick={() => setActiveItemId(row.item.id)}>
                      <strong>{row.fileName}</strong>
                      <span>{row.spec.width} x {row.spec.height}</span>
                      <small className={overLimit ? 'size-warning' : ''}>
                        预计 {formatMegabytes(row.estimatedBytes)}{overLimit ? ' · 可能超限' : ''}
                      </small>
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="export-preview-panel">
            <div className="export-column-heading">
              <span>预览</span>
              {activeSpec ? <span>{activeSpec.width} x {activeSpec.height}</span> : null}
            </div>
            <div className="export-preview-stage">
              {activeSpec ? (
                <BoardCanvas
                  asset={activeAsset}
                  spec={activeSpec}
                  previewState={activePreviewState}
                  logoAsset={exportLogo}
                  cprAsset={exportCpr}
                  brandLayer={exportBrandLayer}
                  overlayCompanyLogo={brandAssets.find((asset) => asset.id === exportBrandLayer.logoGroup?.companyLogoId) ?? brandAssets.find((asset) => asset.type === 'logo' && asset.language === 'custom')}
                  overlayGameLogo={exportLogo}
                  scale={previewScale}
                />
              ) : (
                <div className="empty-state">没有可导出的画板</div>
              )}
            </div>
            {activeAsset && activeSpec ? (
              <div className="export-preview-meta">
                <span>{activeAsset.fileName}</span>
                <span>{activeSpec.name}</span>
              </div>
            ) : null}
          </section>

          <aside className="export-settings-panel">
            <div className="export-column-heading">
              <span>导出设置</span>
            </div>
            <label className="export-field">
              <span>批次名</span>
              <input value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="material" />
            </label>
            <div className="export-field">
              <span>格式</span>
              <div className="segmented-control export-format-control">
                <button type="button" className={format === 'png' ? 'active' : ''} onClick={() => setFormat('png')}>PNG</button>
                <button type="button" className={format === 'jpg' ? 'active' : ''} onClick={() => setFormat('jpg')}>JPG</button>
              </div>
            </div>
            {format === 'jpg' ? (
              <label className="export-field">
                <span>JPG 质量 {Math.round(quality * 100)}%</span>
                <input type="range" min="0.4" max="1" step="0.01" value={quality} onChange={(event) => setQuality(Number(event.target.value))} />
              </label>
            ) : null}
            <div className="export-setting-group">
              <label className="toggle">
                <input type="checkbox" checked={logoEnabled} onChange={(event) => setLogoEnabled(event.target.checked)} />
                添加 Logo
              </label>
              <select value={logoLanguage} onChange={(event) => setLogoLanguage(event.target.value as BrandLanguage)} disabled={!logoEnabled}>
                {BRAND_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="export-setting-group">
              <label className="toggle">
                <input type="checkbox" checked={cprEnabled} onChange={(event) => setCprEnabled(event.target.checked)} />
                添加 CPR
              </label>
            </div>
            <div className="export-summary-box">
              <span>已选 {selectedRows.length} 个文件</span>
              <strong>预计 {formatMegabytes(selectedBytes)}</strong>
              <small>实际大小会受画面内容和压缩率影响</small>
              {logoEnabled && !exportLogo ? <small className="size-warning">当前 Logo 语种没有可用资源</small> : null}
              {cprEnabled && !exportCpr ? <small className="size-warning">固定 CPR SVG 不可用</small> : null}
            </div>
            <p className="dialog-help">导出时优先选择文件夹直接写入；不支持时会改为浏览器逐个下载。</p>
          </aside>
        </div>

        <div className="dialog-footer export-footer">
          <div>
            {exporting ? <span>正在导出 {progress.current} / {progress.total}</span> : <span>每张图独立输出</span>}
            {errorMessage ? <strong className="export-error">{errorMessage}</strong> : null}
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={exporting}>取消</button>
            <button type="button" className="primary-button" onClick={() => void exportSelectedFiles()} disabled={!selectedRows.length || exporting || missingBrandResource}>
              {exporting ? '正在导出...' : `导出 ${selectedRows.length} 个文件`}
            </button>
          </div>
        </div>
      </section>
    </ExportDialog>
  );
}

export function App() {
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
  const [logoGroup, setLogoGroup] = useState<LogoGroupState>(() =>
    createDefaultLogoGroup(loadBrandSettings().defaultLanguage)
  );
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [customPresets, setCustomPresets] = useState<PresetTemplate[]>(() => loadCustomPresetTemplates());
  const [presetApplyMode, setPresetApplyMode] = useState<PresetApplyMode>('replace');
  const [focusSpecId, setFocusSpecId] = useState<string | undefined>();
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | undefined>();
  const [newPresetName, setNewPresetName] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [message, setMessage] = useState<string>('');

  const result = useMemo(() => parseSpecText(draftText), [draftText]);
  const hasPendingSpecChanges = draftText.trim() !== appliedText.trim();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const selectedSpec = specs.find((spec) => spec.id === selectedSpecId) ?? specs[0];
  const focusSpec = specs.find((spec) => spec.id === focusSpecId);
  const focusPreviewKey = selectedAsset && focusSpec ? getBoardPreviewKey(selectedAsset.id, focusSpec.id) : undefined;
  const focusPreviewState = focusPreviewKey ? previewStates[focusPreviewKey] : undefined;
  const logoAssets = brandAssets.filter((asset) => asset.type === 'logo');
  const cprAssets = brandAssets.filter((asset) => asset.type === 'cpr');
  const selectedLogo = logoAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const selectedCpr = cprAssets.find((asset) => asset.id === brandLayer.selectedCprId);
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
    saveBrandSettings(brandSettings);
  }, [brandSettings]);

  useEffect(() => {
    setBrandLayer((previous) => {
      const nextLogoId = resolvePreferredBrandAssetId(brandAssets, 'logo', previous.logoLanguage, previous.selectedLogoId);
      const nextCprId = resolvePreferredBrandAssetId(brandAssets, 'cpr', previous.cprLanguage, previous.selectedCprId);
      if (nextLogoId === previous.selectedLogoId && nextCprId === previous.selectedCprId && previous.logoGroup) {
        return previous;
      }
      return {
        ...previous,
        selectedLogoId: nextLogoId,
        selectedCprId: nextCprId,
        logoGroup: previous.logoGroup ?? logoGroup
      };
    });
  }, [brandAssets, logoGroup]);

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
    const failures = results.filter((result) => result.status === 'rejected');
    if (nextAssets.length) {
      setAssets((previous) => [...previous, ...nextAssets]);
      setSelectedAssetId((current) => current ?? nextAssets[0]?.id);
    }
    setMessage(
      failures.length
        ? `已导入 ${nextAssets.length} 张图片，${failures.length} 个文件失败`
        : `已导入 ${nextAssets.length} 张图片`
    );
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
    } else {
      setCustomPresets((previous) => previous.filter((preset) => preset.id !== pendingConfirmation.presetId));
      setMessage(`已删除套组：${pendingConfirmation.presetName}`);
    }
    setPendingConfirmation(undefined);
  }

  function openFocusEditor(specId: string) {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedSpecId(specId);
    setFocusSpecId(specId);
  }

  function closeFocusEditor() {
    setFocusSpecId(undefined);
    requestAnimationFrame(() => focusReturnRef.current?.focus());
  }

  function saveFocusPreview(nextPreviewState: BoardPreviewState) {
    const key = getBoardPreviewKey(nextPreviewState.assetId, nextPreviewState.specId);
    setPreviewStates((previous) => ({ ...previous, [key]: nextPreviewState }));
    setSelectedSpecId(nextPreviewState.specId);
    closeFocusEditor();
    setMessage('已保存当前画板调整');
  }

  function changeBrandLanguage(language: BrandLanguage) {
    setBrandLayer((previous) => ({
      ...previous,
      logoLanguage: language,
      selectedLogoId: resolvePreferredBrandAssetId(brandAssets, 'logo', language, previous.selectedLogoId)
    }));
  }

  async function handleLogoFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setMessage('正在读取 SVG 资源...');
    const language = brandLayer.logoLanguage;
    try {
      const nextAssets = await Promise.all(files.map((file) => createBrandAssetFromFile(file, 'logo', language)));
      setBrandAssets((previous) => [...previous, ...nextAssets]);
      setBrandLayer((previous) => ({
        ...previous,
        selectedLogoId: nextAssets[0]?.id ?? previous.selectedLogoId
      }));
      setMessage(`已导入 ${nextAssets.length} 个 Logo SVG`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SVG 导入失败');
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  return (
    <main className="app-shell">
      <WorkbenchHeader
        assetCount={assets.length}
        boardCount={specs.length}
        previewCount={Object.keys(workbenchState.previewStates).length}
        hasPendingSpecChanges={hasPendingSpecChanges}
        onOpenSettings={() => setSettingsDialogOpen(true)}
      />

      <section className="workspace">
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
                <button
                  key={asset.id}
                  type="button"
                  className={`asset-row ${asset.id === selectedAsset?.id ? 'active' : ''}`}
                  onClick={() => setSelectedAssetId(asset.id)}
                >
                  <img src={asset.objectUrl} alt={asset.fileName} />
                  <span>
                    <strong>{asset.fileName}</strong>
                    <small>
                      {asset.width} x {asset.height} · {formatFileSize(asset.fileSize)}
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>

          <BrandPanel>
          <LogoGroupControls
            group={logoGroup}
            onChange={(next) => {
              setLogoGroup(next);
              const anchor = next.placement === 'corner-left' ? 'top-left' : next.placement === 'corner-right' ? 'top-right' : 'center';
              const color = next.colorMode === 'black' ? '#000000' : '#ffffff';
              setBrandLayer((previous) => ({
                ...previous,
                logoGroup: next,
                logoAnchor: next.placement === 'custom' ? previous.logoAnchor : anchor,
                // A custom Logo Group must not move CPR. Keep the most recent explicit
                // left/center/right alignment for its bottom-fixed placement.
                cprAnchor: next.placement === 'custom' ? previous.cprAnchor : anchor,
                logoSize: next.sizePreset,
                cprFollowsLogoGroup: true,
                logoEffect: { ...previous.logoEffect, colorEnabled: next.colorMode !== 'original', color, strokeEnabled: false, glowEnabled: false, shadowEnabled: false },
                cprEffect: { ...previous.cprEffect, colorEnabled: next.colorMode !== 'original', color, strokeEnabled: false, glowEnabled: false, shadowEnabled: false }
              }));
            }}
          />
          <BrandGuideControls settings={brandSettings} onChange={(next) => { setBrandSettings(next); saveBrandSettings(next); }} />
          <div className="brand-section">
            <div className="panel-heading">
              <h2>Logo 资源</h2>
              <button type="button" onClick={() => logoInputRef.current?.click()}>
                导入
              </button>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              multiple
              hidden
              onChange={(event) => void handleLogoFiles(event.target.files)}
            />
            <div className="toolbar-line">
              <select
                value={brandLayer.logoLanguage}
                onChange={(event) => changeBrandLanguage(event.target.value as BrandLanguage)}
              >
                {BRAND_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={brandLayer.logoEnabled}
                  onChange={(event) => setBrandLayer((previous) => ({ ...previous, logoEnabled: event.target.checked }))}
                />
                启用
              </label>
            </div>
            <BrandAssetList
              assets={logoAssets}
              selectedId={brandLayer.selectedLogoId}
              onSelect={(asset) =>
                setBrandLayer((previous) => ({
                  ...previous,
                  logoLanguage: asset.language,
                  selectedLogoId: asset.id
                }))
              }
            />
          </div>

          <div className="brand-section">
            <div className="panel-heading"><h2>CPR</h2><small>固定品牌组件</small></div>
            <label className="toggle">
              <input type="checkbox" checked={brandLayer.cprEnabled} onChange={(event) => setBrandLayer((previous) => ({ ...previous, cprEnabled: event.target.checked }))} />
              显示固定版权信息
            </label>
            <p className="inline-note">正式 SVG 固定于底部；仅继承 Logo 的左 / 中 / 右对齐和黑白模式。</p>
          </div>
          <BrandEffectControls
            title="Logo 样式"
            effect={brandLayer.logoEffect}
            onChange={(logoEffect) => setBrandLayer((previous) => ({ ...previous, logoEffect }))}
          />
          </BrandPanel>
        </AssetSidebar>

        <BoardOverview disabled={!assets.length || !specs.length} onExport={() => setExportDialogOpen(true)} message={message}>
          <PreviewStage
            asset={selectedAsset}
            specs={specs}
            selectedSpecId={selectedSpec?.id}
            previewStates={previewStates}
            logoAsset={selectedLogo}
            cprAsset={selectedCpr}
            brandLayer={brandLayer}
            brandSettings={brandSettings}
            logoGroup={logoGroup}
            overlayCompanyLogo={companyLogoAsset}
            overlayGameLogo={gameLogoAsset}
            onSelectSpec={setSelectedSpecId}
            onEditSpec={openFocusEditor}
          />
        </BoardOverview>

        <SpecPanel boardCount={specs.length}>
          <div className="preset-section">
            <div className="toolbar-line panel-actions">
              <div className="segmented-control">
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
          <textarea
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder="粘贴尺寸片段，例如 1080x1920、1920*1080、16:9 1920"
            spellCheck={false}
          />
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
                onClick={() => setSelectedSpecId(spec.id)}
                onDoubleClick={() => openFocusEditor(spec.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    openFocusEditor(spec.id);
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
      </section>
      {focusSpec && (
        <FocusEditorModal
          key={`${selectedAsset?.id ?? 'empty'}:${focusSpec.id}`}
          asset={selectedAsset}
          spec={focusSpec}
          previewState={focusPreviewState}
          logoAsset={selectedLogo}
          cprAsset={selectedCpr}
          brandLayer={brandLayer}
          brandSettings={brandSettings}
          logoGroup={logoGroup}
          overlayCompanyLogo={companyLogoAsset}
          overlayGameLogo={gameLogoAsset}
          onCancel={closeFocusEditor}
          onSave={saveFocusPreview}
        />
      )}
      {pendingConfirmation && (
        <ConfirmationDialog
          title={pendingConfirmation.type === 'apply-specs' ? '更新尺寸矩阵' : '删除常用套组'}
          message={
            pendingConfirmation.type === 'apply-specs'
              ? `将更新为 ${pendingConfirmation.count} 个画板。同规格裁切会尽量保留，已删除规格的状态会被移除。`
              : `确定删除“${pendingConfirmation.presetName}”吗？删除后无法恢复。`
          }
          confirmLabel={pendingConfirmation.type === 'apply-specs' ? '确认更新' : '确认删除'}
          destructive={pendingConfirmation.type === 'delete-preset'}
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
          onClose={() => setExportDialogOpen(false)}
          onComplete={setMessage}
        />
      )}
      {settingsDialogOpen && (
        <BrandSettingsDialog
          settings={brandSettings}
          onClose={() => setSettingsDialogOpen(false)}
          onChange={(next) => { setBrandSettings(next); saveBrandSettings(next); }}
          onReset={() => { setBrandSettings(DEFAULT_BRAND_SETTINGS); saveBrandSettings(DEFAULT_BRAND_SETTINGS); }}
        />
      )}
    </main>
  );
}
