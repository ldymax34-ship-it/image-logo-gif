import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BRAND_LANGUAGE_OPTIONS,
  PRESET_TEMPLATES,
  buildBrandRenderPlan,
  buildBoardRenderPlan,
  createBatchExportItems,
  DEFAULT_BRAND_ASSETS,
  DEFAULT_CPR_EFFECT,
  DEFAULT_LOGO_EFFECT,
  buildOutputFileName,
  classifyAspect,
  clampCropState,
  computeFitScale,
  createBrandAssetFromFile,
  createDefaultCprState,
  createDefaultLogoGroup,
  createInitialCropState,
  createMaterialAsset,
  DEFAULT_MAX_SIZE_KB,
  exportBoardImageWithinLimit,
  estimateExportBytes,
  formatFileSize,
  formatMegabytes,
  getBoardPreviewKey,
  getEffectiveMaxSizeKb,
  getBrandLanguageLabel,
  loadBrandSettings,
  loadCustomPresetTemplates,
  panCropState,
  parseSpecText,
  resolveCprState,
  saveBrandSettings,
  saveCustomPresetTemplates,
  serializePresetSpecs,
  snapLogoGroupPosition,
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
import { chooseOutputTarget, saveBlobToOutputTarget } from '../platform/fileSystem';
import {
  AssetSidebar,
  BoardOverview,
  BrandAssetList,
  CprControls,
  BrandEffectControls,
  BrandGuideControls,
  BrandPanel,
  BrandSettingsDialog,
  ExportDialog,
  FocusEditor,
  LogoGroupControls,
  LogoStylePreview,
  MultiAssetBoardOverview,
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
  cprEffect: DEFAULT_CPR_EFFECT,
  cprState: createDefaultCprState()
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
    gapUnits: 0.5,
    placement,
    lastExplicitPlacement: placement
  };
}

function ensureLogoGroups(
  previous: Record<string, LogoGroupState>,
  assets: MaterialAsset[],
  specs: MaterialSpec[],
  settings: BrandSettingsV1
): Record<string, LogoGroupState> {
  const next: Record<string, LogoGroupState> = {};
  for (const asset of assets) {
    for (const spec of specs) {
      const key = getBoardPreviewKey(asset.id, spec.id);
      next[key] = previous[key] ?? createLogoGroupFromSettings(settings, spec);
    }
  }
  return next;
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
  onSave,
  onApplyToSameAspect
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
  onSave: (previewState: BoardPreviewState, logoGroup: LogoGroupState) => void;
  onApplyToSameAspect: (logoGroup: LogoGroupState) => void;
}) {
  const dragRef = useRef<
    | { kind: 'crop'; pointerId: number; x: number; y: number }
    | { kind: 'brand'; pointerId: number; x: number; y: number; originX: number; originY: number; width: number; height: number }
    | null
  >(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const initialState = previewState ?? (asset ? createPreviewState(asset, spec, 'cover') : undefined);
  const [draftState, setDraftState] = useState<BoardPreviewState | undefined>(initialState);
  const [draftLogoGroup, setDraftLogoGroup] = useState<LogoGroupState>(logoGroup);
  const [editMode, setEditMode] = useState<'crop' | 'brand'>('crop');
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
    initialState.crop.offsetY !== draftState.crop.offsetY ||
    JSON.stringify(logoGroup) !== JSON.stringify(draftLogoGroup)
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
    if (editMode === 'brand') {
      const plan = buildBrandRenderPlan({ width: spec.width, height: spec.height }, draftLogoGroup, {
        companyLogo: overlayCompanyLogo,
        gameLogo: overlayGameLogo,
        cprEnabled: brandLayer.cprEnabled
      });
      if (!plan.logoGroupRect) return;
      dragRef.current = {
        kind: 'brand',
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        originX: plan.logoGroupRect.x,
        originY: plan.logoGroupRect.y,
        width: plan.logoGroupRect.width,
        height: plan.logoGroupRect.height
      };
      return;
    }
    dragRef.current = { kind: 'crop', pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!asset || !draftState || !dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    if (dragRef.current.kind === 'brand') {
      const raw = {
        x: dragRef.current.originX + (event.clientX - dragRef.current.x) / stageScale,
        y: dragRef.current.originY + (event.clientY - dragRef.current.y) / stageScale
      };
      const next = brandSettings.snapEnabled
        ? snapLogoGroupPosition(
            { width: spec.width, height: spec.height },
            { width: dragRef.current.width, height: dragRef.current.height },
            raw,
            brandSettings.snapThreshold / stageScale
          )
        : raw;
      setDraftLogoGroup((previous) => ({
        ...previous,
        placement: 'custom',
        manualOffset: { x: next.x, y: next.y }
      }));
      return;
    }
    const deltaX = (event.clientX - dragRef.current.x) / stageScale;
    const deltaY = (event.clientY - dragRef.current.y) / stageScale;
    dragRef.current = { kind: 'crop', pointerId: event.pointerId, x: event.clientX, y: event.clientY };
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
              brandLayer={{ ...brandLayer, logoGroup: draftLogoGroup }}
              scale={stageScale}
              draggable={Boolean(asset)}
              brandSettings={brandSettings}
              logoGroup={draftLogoGroup}
              overlayCompanyLogo={overlayCompanyLogo}
              overlayGameLogo={overlayGameLogo}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>

          <div className="focus-side-controls">
            <div>
              <span className="control-label">调整对象</span>
              <div className="segmented-control">
                <button type="button" className={editMode === 'crop' ? 'active' : ''} onClick={() => setEditMode('crop')}>图片裁切</button>
                <button type="button" className={editMode === 'brand' ? 'active' : ''} onClick={() => setEditMode('brand')}>品牌位置</button>
              </div>
            </div>
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
            <button type="button" onClick={() => onApplyToSameAspect(draftLogoGroup)} disabled={!asset}>应用品牌位置到同版型</button>
            <p id="focus-dialog-help" className="dialog-help">切换调整对象后拖动画布。品牌位置会按网格和参考点吸附，CPR 始终固定在底部。</p>
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
              <button type="button" className="primary-button" onClick={() => draftState && onSave(draftState, draftLogoGroup)} disabled={!draftState || !asset}>
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
  logoGroupsByBoard,
  onClose,
  onComplete
}: {
  assets: MaterialAsset[];
  specs: MaterialSpec[];
  previewStates: Record<string, BoardPreviewState>;
  brandAssets: BrandAsset[];
  brandLayer: BrandLayerState;
  logoGroupsByBoard: Record<string, LogoGroupState>;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const items = useMemo(() => createBatchExportItems(assets, specs), [assets, specs]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(items.map((item) => item.id)));
  const [activeItemId, setActiveItemId] = useState(items[0]?.id);
  const [format, setFormat] = useState<MaterialFormat>('png');
  const [quality, setQuality] = useState(0.9);
  const [defaultMaxSizeMb, setDefaultMaxSizeMb] = useState(8);
  const [autoCompressJpeg, setAutoCompressJpeg] = useState(true);
  const [batchName, setBatchName] = useState('material');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');

  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0];
  const activeAsset = assets.find((asset) => asset.id === activeItem?.assetId);
  const activeSpec = specs.find((spec) => spec.id === activeItem?.specId);
  const activePreviewState = activeAsset && activeSpec
    ? previewStates[getBoardPreviewKey(activeAsset.id, activeSpec.id)]
    : undefined;
  // Export deliberately reads the workspace state as-is. It must not create a
  // second, divergent set of Logo / CPR choices inside the export dialog.
  const exportLogo = brandAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const exportCpr = brandAssets.find((asset) => asset.id === brandLayer.selectedCprId);
  const activeBoardLogoGroup = activeAsset && activeSpec
    ? logoGroupsByBoard[getBoardPreviewKey(activeAsset.id, activeSpec.id)] ?? brandLayer.logoGroup
    : brandLayer.logoGroup;
  const activeCompanyLogo = brandAssets.find((asset) => asset.id === activeBoardLogoGroup?.companyLogoId)
    ?? brandAssets.find((asset) => asset.type === 'logo' && asset.language === 'custom');
  const activeGameLogo = brandAssets.find((asset) => asset.id === activeBoardLogoGroup?.gameLogoId) ?? exportLogo;

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
        language: brandLayer.logoEnabled ? brandLayer.logoLanguage : undefined,
        index
      }
    );
    const effectiveMaxSizeKb = getEffectiveMaxSizeKb(spec, Math.round(defaultMaxSizeMb * 1024) || DEFAULT_MAX_SIZE_KB);
    return { item, asset, spec, estimatedBytes, effectiveMaxSizeKb, fileName };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

  const selectedRows = rows.filter((row) => selectedIds.has(row.item.id));
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
    let processed = 0;

    for (const row of selectedRows) {
      const previewState = previewStates[getBoardPreviewKey(row.asset.id, row.spec.id)];
      if (!previewState) {
        failures.push(`${row.fileName}：缺少画板预览状态`);
        processed += 1;
        setProgress({ current: processed, total: selectedRows.length });
        continue;
      }
      try {
        const boardLogoGroup = logoGroupsByBoard[getBoardPreviewKey(row.asset.id, row.spec.id)] ?? brandLayer.logoGroup;
        const boardCompanyLogo = brandAssets.find((asset) => asset.id === boardLogoGroup?.companyLogoId)
          ?? brandAssets.find((asset) => asset.type === 'logo' && asset.language === 'custom');
        const boardGameLogo = brandAssets.find((asset) => asset.id === boardLogoGroup?.gameLogoId) ?? exportLogo;
        const result = await exportBoardImageWithinLimit({
          asset: row.asset,
          spec: row.spec,
          previewState,
          brandLayer: { ...brandLayer, logoGroup: boardLogoGroup },
          logoAsset: exportLogo,
          cprAsset: exportCpr,
          companyLogoAsset: boardCompanyLogo,
          gameLogoAsset: boardGameLogo,
          format,
          quality,
          maxBytes: row.effectiveMaxSizeKb * 1024,
          autoCompressJpeg,
          minJpegQuality: 0.4
        });
        if (!result.ok) {
          const maxLabel = `${(row.effectiveMaxSizeKb / 1024).toFixed(row.effectiveMaxSizeKb % 1024 === 0 ? 0 : 1)}MB`;
          throw new Error(
            result.reason === 'png-over-limit'
              ? `PNG 实际为 ${formatMegabytes(result.size)}，超过 ${maxLabel}；请改用 JPG 或调整尺寸`
              : `在保持当前尺寸时无法压缩到 ${maxLabel} 以下，请降低尺寸或调整内容`
          );
        }
        await saveBlobToOutputTarget(outputTarget, row.fileName, result.blob);
        if (outputTarget.kind === 'downloads') {
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
        completed += 1;
        if (result.compressed && result.quality) {
          failures.push(`__info__${row.fileName}：已自动压缩至 ${formatMegabytes(result.blob.size)}（${Math.round(result.quality * 100)}%）`);
        }
      } catch (error) {
        failures.push(`${row.fileName}：${error instanceof Error ? error.message : '导出失败'}`);
      }
      processed += 1;
      setProgress({ current: processed, total: selectedRows.length });
    }

    setExporting(false);
    const actualFailures = failures.filter((item) => !item.startsWith('__info__'));
    const compressionInfo = failures.find((item) => item.startsWith('__info__'))?.replace('__info__', '');
    if (actualFailures.length) {
      setErrorMessage(`已导出 ${completed} 个文件，${actualFailures.length} 个失败。${actualFailures[0]}`);
      return;
    }
    onComplete(compressionInfo ?? `已导出 ${completed} 个文件`);
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
                const overLimit = row.estimatedBytes > row.effectiveMaxSizeKb * 1024;
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
                        预计 {formatMegabytes(row.estimatedBytes)}{overLimit ? ` · 超过${row.spec.maxSizeKb ? '规格限制 ' : ' '}${(row.effectiveMaxSizeKb / 1024).toFixed(row.effectiveMaxSizeKb % 1024 === 0 ? 0 : 1)}MB` : ''}
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
                  brandLayer={{
                    ...brandLayer,
                    logoGroup: activeBoardLogoGroup
                  }}
                  overlayCompanyLogo={activeCompanyLogo}
                  overlayGameLogo={activeGameLogo}
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
            <label className="export-field">
              <span>指定</span>
              <div className="export-limit-input"><input aria-label="指定 MB" type="number" min="0.1" max="100" step="0.1" value={defaultMaxSizeMb} onChange={(event) => setDefaultMaxSizeMb(Math.min(100, Math.max(0.1, Number(event.target.value) || 8)))} /><small>MB</small></div>
            </label>
            {format === 'jpg' ? <label className="toggle"><input type="checkbox" checked={autoCompressJpeg} onChange={(event) => setAutoCompressJpeg(event.target.checked)} />JPG 超限时自动压缩</label> : null}
            <div className="export-summary-box">
              <span>已选 {selectedRows.length} 个文件</span>
            </div>
            <p className="dialog-help">导出时优先选择文件夹直接写入；不支持时会改为浏览器逐个下载。</p>
          </aside>
        </div>

        <div className="dialog-footer export-footer">
          <div className="export-status" aria-live="polite">
            <span>{exporting ? `正在导出 ${progress.current} / ${progress.total}` : '每张图独立输出'}</span>
            <strong className="export-error" title={errorMessage}>{errorMessage || ' '}</strong>
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={exporting}>取消</button>
            <button type="button" className="primary-button" onClick={() => void exportSelectedFiles()} disabled={!selectedRows.length || exporting}>
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
  const [logoGroupsByBoard, setLogoGroupsByBoard] = useState<Record<string, LogoGroupState>>({});
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [customPresets, setCustomPresets] = useState<PresetTemplate[]>(() => loadCustomPresetTemplates());
  const [presetApplyMode, setPresetApplyMode] = useState<PresetApplyMode>('replace');
  const [focusAssetId, setFocusAssetId] = useState<string | undefined>();
  const [focusSpecId, setFocusSpecId] = useState<string | undefined>();
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | undefined>();
  const [newPresetName, setNewPresetName] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [importFailures, setImportFailures] = useState<string[]>([]);

  const result = useMemo(() => parseSpecText(draftText), [draftText]);
  const hasPendingSpecChanges = draftText.trim() !== appliedText.trim();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const selectedSpec = specs.find((spec) => spec.id === selectedSpecId) ?? specs[0];
  const selectedBoardKey = selectedAsset && selectedSpec ? getBoardPreviewKey(selectedAsset.id, selectedSpec.id) : undefined;
  const selectedLogoGroup = selectedBoardKey ? logoGroupsByBoard[selectedBoardKey] ?? logoGroup : logoGroup;
  const focusAsset = assets.find((asset) => asset.id === focusAssetId);
  const focusSpec = specs.find((spec) => spec.id === focusSpecId);
  const focusPreviewKey = focusAsset && focusSpec ? getBoardPreviewKey(focusAsset.id, focusSpec.id) : undefined;
  const focusPreviewState = focusPreviewKey ? previewStates[focusPreviewKey] : undefined;
  const logoAssets = brandAssets.filter((asset) => asset.type === 'logo');
  const cprAssets = brandAssets.filter((asset) => asset.type === 'cpr');
  const selectedLogo = logoAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const selectedCpr = cprAssets.find((asset) => asset.id === brandLayer.selectedCprId);
  const cprState = resolveCprState(brandLayer);
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
    setLogoGroupsByBoard((previous) => ensureLogoGroups(previous, assets, specs, brandSettings));
  }, [assets, specs, brandSettings]);

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
      setLogoGroup(defaults);
      setBrandLayer((previous) => ({
        ...previous,
        cprEnabled: brandSettings.cprEnabled,
        cprState: {
          ...resolveCprState(previous),
          enabled: brandSettings.cprEnabled,
          placement: brandSettings.defaultCprPlacement,
          colorMode: brandSettings.defaultCprColorMode,
          effect: {
            ...resolveCprState(previous).effect,
            colorEnabled: brandSettings.defaultCprColorMode !== 'original',
            color: brandSettings.defaultCprColorMode === 'black' ? '#000000' : '#ffffff'
          }
        },
        logoLanguage: brandSettings.defaultLanguage,
        logoGroup: defaults,
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
    setLogoGroupsByBoard((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${assetId}:`))));
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

  function saveFocusPreview(nextPreviewState: BoardPreviewState, nextLogoGroup: LogoGroupState) {
    const key = getBoardPreviewKey(nextPreviewState.assetId, nextPreviewState.specId);
    setPreviewStates((previous) => ({ ...previous, [key]: nextPreviewState }));
    setLogoGroupsByBoard((previous) => ({ ...previous, [key]: nextLogoGroup }));
    setLogoGroup(nextLogoGroup);
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
    setLogoGroupsByBoard((previous) => {
      const next = { ...previous };
      for (const key of matchingKeys) next[key] = { ...nextLogoGroup };
      return next;
    });
    setMessage(`已将品牌位置应用到 ${matchingKeys.length} 个${family === 'landscape' ? '横版' : family === 'portrait' ? '竖版' : '方图'}画板`);
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

          <BrandPanel>
          <section className="brand-control-group" aria-labelledby="logo-controls-title">
          <div className="brand-control-heading"><div><h3 id="logo-controls-title">Logo</h3><small>组合与单项资源</small></div></div>
          <LogoGroupControls
            group={selectedLogoGroup}
            onChange={(next) => {
              setLogoGroup(next);
              if (selectedBoardKey) {
                setLogoGroupsByBoard((previous) => ({ ...previous, [selectedBoardKey]: next }));
              }
              const anchor = next.placement === 'corner-left' ? 'top-left' : next.placement === 'corner-right' ? 'top-right' : 'center';
              const color = next.colorMode === 'black' ? '#000000' : '#ffffff';
              setBrandLayer((previous) => ({
                ...previous,
                logoGroup: next,
                logoAnchor: next.placement === 'custom' ? previous.logoAnchor : anchor,
                logoSize: next.sizePreset,
                logoEffect: { ...previous.logoEffect, colorEnabled: next.colorMode !== 'original', color }
              }));
            }}
          />
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

          <BrandEffectControls
            title="Logo"
            effect={brandLayer.logoEffect}
            onChange={(logoEffect) => setBrandLayer((previous) => ({ ...previous, logoEffect }))}
            preview={<LogoStylePreview asset={gameLogoAsset} effect={brandLayer.logoEffect} />}
          />
          </section>
          <CprControls
            state={cprState}
            onChange={(next) => setBrandLayer((previous) => ({
              ...previous,
              cprEnabled: next.enabled,
              cprState: next,
              cprEffect: next.effect,
              cprAnchor: next.placement === 'bottom-left' ? 'top-left' : next.placement === 'bottom-right' ? 'top-right' : 'center'
            }))}
          />
          <section className="brand-control-group" aria-labelledby="guide-controls-title">
            <div className="brand-control-heading"><div><h3 id="guide-controls-title">辅助工具</h3><small>画布显示与吸附</small></div></div>
            <BrandGuideControls settings={brandSettings} onChange={(next) => { setBrandSettings(next); saveBrandSettings(next); }} />
          </section>
          </BrandPanel>
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
            logoGroup={logoGroup}
            logoGroupsByBoard={logoGroupsByBoard}
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
      </section>
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
          logoGroup={focusPreviewKey ? logoGroupsByBoard[focusPreviewKey] ?? logoGroup : logoGroup}
          overlayCompanyLogo={companyLogoAsset}
          overlayGameLogo={gameLogoAsset}
          onCancel={closeFocusEditor}
          onSave={saveFocusPreview}
          onApplyToSameAspect={applyLogoGroupToSameAspect}
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
          logoGroupsByBoard={logoGroupsByBoard}
          onClose={() => setExportDialogOpen(false)}
          onComplete={setMessage}
        />
      )}
      {settingsDialogOpen && (
        <BrandSettingsDialog
          settings={brandSettings}
          onClose={() => setSettingsDialogOpen(false)}
          onChange={(next) => { setBrandSettings(next); saveBrandSettings(next); }}
        />
      )}
    </main>
  );
}
