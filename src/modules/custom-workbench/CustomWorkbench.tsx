import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { BrandEffectControls } from '../../components/brand/BrandEffectControls';
import { buildBoardRenderPlan, canvasToBlob, computeCprPlacementRect, computeFitScale, createInitialCropState, createMaterialAsset, deriveBrandColorMode, drawBrandLayersToCanvas, exportBoardImageWithinLimit, exportJpegWithinLimit, panCropState, renderBoardToCanvas, snapLogoGroupPosition, zoomCropState, type BrandAsset, type BrandEffectState, type BrandLanguage, type BrandLayerState, type BoardPreviewState, type MaterialAsset, type MaterialFormat, type MaterialSpec, getBrandLanguageLabel } from '../../core';
import { chooseOutputTarget, saveBlobToOutputTarget } from '../../platform/fileSystem';
import { BoardCanvas } from '../../components/canvas';
import { CustomFabricOverlay, type CustomFabricObjectId } from './CustomFabricOverlay';
import { resolveCustomFabricItems, type CustomFabricOverlayItem } from './customFabricItems';
import { constrainCustomTransform, getCustomObjectScaleLimits, getCustomTransformBounds, type CustomObjectTransform } from './customFabricCoords';
import { constrainCustomCanvasObjectTransform, toCustomFabricTransformPatch } from './customFabricState';
import { CUSTOM_CANVAS_OPTION, CUSTOM_MANUAL_CANVAS_PRESETS, MAX_CUSTOM_CANVAS_EDGE, createCustomCanvasSelection, getCustomCanvasOptionValue, resolveCustomCanvasSelection, resolveCustomCanvasSpec, selectCustomCanvasPreset, type CustomCanvasSelection } from './customCanvasSpec';

const CUSTOM_DEFAULT_CANVAS: MaterialSpec = { id: 'custom-source-image', name: '原图尺寸', width: 1920, height: 1080, format: 'png' };
export type CustomWorkbenchDirtySnapshot = { canvasSelection: CustomCanvasSelection; gameEnabled: boolean; companyEnabled: boolean; gameScale: number; companyScale: number; cprScale: number; gameOffset: { x: number; y: number }; companyOffset: { x: number; y: number }; cprOffset: { x: number; y: number }; cprEnabled: boolean; gameEffect: BrandEffectState; companyEffect: BrandEffectState; cprEffect: BrandEffectState; format: MaterialFormat; gameLanguage: BrandLanguage; guidesVisible: boolean; snapEnabled: boolean };
export function isCustomWorkbenchDirty(asset?: MaterialAsset, initial?: CustomWorkbenchDirtySnapshot, current?: CustomWorkbenchDirtySnapshot): boolean { return Boolean(asset) || Boolean(initial && current && JSON.stringify(initial) !== JSON.stringify(current)); }

function fmtScale(v: number): string { return `${v.toFixed(2)}×`; }

function fmtCoord(v: number): string {
  if (v === Math.round(v)) return String(v);
  return v.toFixed(1);
}

function effectSummary(effect: BrandEffectState): string {
  const parts: string[] = [];
  parts.push(effect.strokeEnabled ? '描边开' : '描边关');
  parts.push(effect.shadowEnabled ? '阴影开' : '阴影关');
  parts.push(effect.glowEnabled ? '发光开' : '发光关');
  if (effect.colorEnabled) parts.push('改色');
  return parts.join(' · ');
}

export function CustomExportControls({
  format,
  disabled,
  status,
  onFormatChange,
  onExport
}: {
  format: MaterialFormat;
  disabled: boolean;
  status?: string;
  onFormatChange: (format: MaterialFormat) => void;
  onExport: () => void;
}) {
  return <div className="custom-export-controls" aria-label="导出当前画板">
    <div className="segmented-control" aria-label="导出格式">
      <button type="button" className={format === 'png' ? 'active' : ''} onClick={() => onFormatChange('png')}>PNG</button>
      <button type="button" className={format === 'jpg' ? 'active' : ''} onClick={() => onFormatChange('jpg')}>JPG</button>
    </div>
    <button type="button" className="primary-button" onClick={onExport} disabled={disabled}>导出当前画板</button>
    {status ? <small className="custom-export-status" role="status">{status}</small> : null}
  </div>;
}

export function CustomObjectEffectDisclosure({
  title,
  effect,
  onChange
}: {
  title: string;
  effect: BrandEffectState;
  onChange: (effect: BrandEffectState) => void;
}) {
  return <details className="effect-details custom-effect-details">
    <summary>{title} 高级样式 <span className="effect-summary">{effectSummary(effect)}</span></summary>
    <BrandEffectControls title={title} effect={effect} onChange={onChange} embedded />
  </details>;
}

export function CustomWorkbench({ brandLayer, logoAsset, cprAsset, companyLogo, gameLogo, gameLogos, onDirtyChange }: {
  brandLayer: BrandLayerState;
  logoAsset?: BrandAsset;
  cprAsset?: BrandAsset;
  companyLogo?: BrandAsset;
  gameLogo?: BrandAsset;
  gameLogos: BrandAsset[];
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [asset, setAsset] = useState<MaterialAsset>();
  const [previewState, setPreviewState] = useState<BoardPreviewState>();
  const [gameEnabled, setGameEnabled] = useState(true);
  const [companyEnabled, setCompanyEnabled] = useState(false);
  const [gameScale, setGameScale] = useState(1);
  const [companyScale, setCompanyScale] = useState(1);
  const [gameOffset, setGameOffset] = useState({ x: 460, y: 216 });
  const [companyOffset, setCompanyOffset] = useState({ x: 1036, y: 216 });
  const [cprEnabled, setCprEnabled] = useState(true);
  const [cprScale, setCprScale] = useState(1);
  const [cprOffset, setCprOffset] = useState({ x: 0, y: 0 });
  const [gameEffect, setGameEffect] = useState<BrandEffectState>(brandLayer.logoEffect);
  const [companyEffect, setCompanyEffect] = useState<BrandEffectState>(brandLayer.logoEffect);
  const [cprEffect, setCprEffect] = useState<BrandEffectState>(brandLayer.cprEffect);
  const [format, setFormat] = useState<MaterialFormat>('png');
  const [canvasSelection, setCanvasSelection] = useState<CustomCanvasSelection>(() => resolveCustomCanvasSelection());
  const [customWidthDraft, setCustomWidthDraft] = useState('');
  const [customHeightDraft, setCustomHeightDraft] = useState('');
  const [status, setStatus] = useState('');
  const [gameLanguage, setGameLanguage] = useState<BrandLanguage>(gameLogo?.language ?? 'zh-CN');
  const [guidesVisible, setGuidesVisible] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedObjectId, setSelectedObjectId] = useState<CustomFabricObjectId>();
  const [cropEditing, setCropEditing] = useState(false);
  const cropDragRef = useRef<{ pointerId: number; x: number; y: number }>();
  const initialDirtySnapshot = useRef<CustomWorkbenchDirtySnapshot>({ canvasSelection: resolveCustomCanvasSelection(), gameEnabled: true, companyEnabled: false, gameScale: 1, companyScale: 1, cprScale: 1, gameOffset: { x: 460, y: 216 }, companyOffset: { x: 1036, y: 216 }, cprOffset: { x: 0, y: 0 }, cprEnabled: true, gameEffect: brandLayer.logoEffect, companyEffect: brandLayer.logoEffect, cprEffect: brandLayer.cprEffect, format: 'png', gameLanguage: gameLogo?.language ?? 'zh-CN', guidesVisible: true, snapEnabled: true });

  useEffect(() => {
    const dirty = isCustomWorkbenchDirty(asset, initialDirtySnapshot.current, { canvasSelection, gameEnabled, companyEnabled, gameScale, companyScale, cprScale, gameOffset, companyOffset, cprOffset, cprEnabled, gameEffect, companyEffect, cprEffect, format, gameLanguage, guidesVisible, snapEnabled });
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [asset, canvasSelection, companyEffect, companyEnabled, companyOffset, companyScale, cprEffect, cprEnabled, cprOffset, cprScale, format, gameEffect, gameEnabled, gameLanguage, gameOffset, gameScale, guidesVisible, onDirtyChange, snapEnabled]);

  const group = { mode: 'game-only' as const, gameLogoLanguage: brandLayer.logoLanguage, colorMode: deriveBrandColorMode(gameEffect), sizePreset: 'xl' as const, companyLogoScale: 'match' as const, gapUnits: .5, placement: 'center' as const, lastExplicitPlacement: 'center' as const };
  const customCprState = { enabled: cprEnabled, scale: cprScale, transform: { placement: 'bottom-right' as const, offsetX: cprOffset.x, offsetY: cprOffset.y }, constraintMode: 'canvas' as const, colorMode: deriveBrandColorMode(cprEffect), effect: cprEffect };
  const gameGroup = {
    ...group,
    mode: 'game-only' as const,
    colorMode: deriveBrandColorMode(gameEffect),
    sizePreset: 'standard' as const,
    scale: gameScale,
    manualOffset: gameOffset,
    placement: 'custom' as const,
    gameLogoScale: 1,
    companyLogoScale: 'match' as const,
    constraintMode: 'canvas' as const
  };
  const companyGroup = {
    ...group,
    mode: 'company-only' as const,
    colorMode: deriveBrandColorMode(companyEffect),
    sizePreset: 'standard' as const,
    scale: companyScale,
    manualOffset: companyOffset,
    placement: 'custom' as const,
    companyLogoScale: 'match' as const,
    companyLogoScaleFactor: 1,
    constraintMode: 'canvas' as const
  };
  const selectedGameLogo = gameLogos.find((item) => item.language === gameLanguage) ?? gameLogo;
  const canvasSpec = resolveCustomCanvasSpec(asset, canvasSelection, format);
  const canvas = canvasSpec ?? CUSTOM_DEFAULT_CANVAS;

  function numberControl(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void) {
    const displayValue = Number(value.toFixed(step < 1 ? 2 : 1));
    return <label className="range-field custom-number-field"><span>{label}</span><input aria-label={`${label}数值`} type="number" min={min} max={max} step={step} value={displayValue} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} /></label>;
  }

  function updateCropMode(fitMode: BoardPreviewState['fitMode']) {
    if (!asset || !previewState) return;
    setPreviewState({
      ...previewState,
      fitMode,
      crop: createInitialCropState(asset, canvas, fitMode)
    });
  }

  function updateCropScale(scale: number) {
    if (!asset || !previewState) return;
    setPreviewState({
      ...previewState,
      crop: zoomCropState(asset, canvas, previewState.crop, scale, { x: canvas.width / 2, y: canvas.height / 2 }, previewState.fitMode)
    });
  }

  function resetCrop() {
    if (!asset || !previewState) return;
    setPreviewState({ ...previewState, crop: createInitialCropState(asset, canvas, previewState.fitMode) });
  }

  function onCropPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!asset || !previewState || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onCropPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = cropDragRef.current;
    if (!asset || !previewState || !drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.x) / previewScale;
    const dy = (event.clientY - drag.y) / previewScale;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setPreviewState((previous) => previous ? {
      ...previous,
      crop: panCropState(asset, canvas, previous.crop, dx, dy, previous.fitMode)
    } : previous);
  }

  function stopCropDrag() { cropDragRef.current = undefined; }

  async function importAsset(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    try {
      const next = await createMaterialAsset(file);
      if (asset) URL.revokeObjectURL(asset.objectUrl);
      setAsset(next);
      const nextSpec = resolveCustomCanvasSpec(next, canvasSelection, format) ?? CUSTOM_DEFAULT_CANVAS;
      setPreviewState({ assetId: next.id, specId: nextSpec.id, fitMode: 'contain', crop: createInitialCropState(next, nextSpec, 'contain') });
      setStatus(`已导入 ${next.fileName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  useEffect(() => () => { if (asset) URL.revokeObjectURL(asset.objectUrl); }, [asset]);

  function updateCanvasSelection(next: CustomCanvasSelection) {
    setCanvasSelection(next);
    if (!asset) return;
    const nextSpec = resolveCustomCanvasSpec(asset, next, format);
    if (!nextSpec) return;
    setPreviewState((previous) => ({
      assetId: asset.id,
      specId: nextSpec.id,
      fitMode: previous?.fitMode ?? 'contain',
      // A target aspect/size switch starts from the selected fit mode. This
      // prevents stale crop offsets from a different canvas drifting or
      // exposing empty space; subsequent user adjustments stay persistent.
      crop: createInitialCropState(asset, nextSpec, previous?.fitMode ?? 'contain')
    }));
  }

  function selectCanvasSize(option: string) {
    if (option === CUSTOM_CANVAS_OPTION) {
      const basis = canvasSelection.mode === 'manual' && canvasSelection.manualSpec ? canvasSelection.manualSpec : canvas;
      const next = createCustomCanvasSelection(basis.width, basis.height);
      if (!next) return;
      setCustomWidthDraft(String(next.manualSpec!.width));
      setCustomHeightDraft(String(next.manualSpec!.height));
      updateCanvasSelection(next);
      return;
    }
    const next = selectCustomCanvasPreset(option);
    setCustomWidthDraft(next.manualSpec ? String(next.manualSpec.width) : '');
    setCustomHeightDraft(next.manualSpec ? String(next.manualSpec.height) : '');
    updateCanvasSelection(next);
  }

  function commitCustomCanvasSize() {
    const next = createCustomCanvasSelection(Number(customWidthDraft), Number(customHeightDraft));
    if (!next) {
      setStatus(`请输入 1-${MAX_CUSTOM_CANVAS_EDGE} 的整数宽高`);
      return;
    }
    setStatus('');
    updateCanvasSelection(next);
  }

  async function exportCurrent() {
    if (!asset || !previewState) return;
    const target = await chooseOutputTarget();
    if (target.kind === 'cancelled') return;
    try {
      const result = await exportBoardImageWithinLimit({
        asset,
        spec: canvas,
        previewState,
        brandLayer: { ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: renderCprState, logoGroup: renderGameGroup },
        logoAsset,
        cprAsset,
        companyLogoAsset: undefined,
        gameLogoAsset: selectedGameLogo,
        format,
        quality: .92,
        maxBytes: 8 * 1024 * 1024,
        autoCompressJpeg: true
      });
      if (!result.ok) throw new Error('当前尺寸无法满足 8MB 限制');
      if (companyEnabled && companyLogo) {
        const renderedCanvas = await renderBoardToCanvas({ asset, spec: canvas, previewState, brandLayer: { ...brandLayer, logoEnabled: false, cprEnabled: false, logoGroup: renderGameGroup }, format });
        const gamePlan = buildBoardRenderPlan({ asset, spec: canvas, previewState, brandLayer: { ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: renderCprState, logoGroup: renderGameGroup }, cprAsset, gameLogoAsset: selectedGameLogo });
        const companyPlan = buildBoardRenderPlan({ asset, spec: canvas, previewState, brandLayer: { ...brandLayer, logoEnabled: true, cprEnabled: false, logoEffect: companyEffect, logoGroup: renderCompanyGroup }, companyLogoAsset: companyLogo });
        await drawBrandLayersToCanvas(renderedCanvas, [...gamePlan.layers, ...companyPlan.layers]);
        const maxBytes = 8 * 1024 * 1024;
        if (format === 'png') {
          const blob = await canvasToBlob(renderedCanvas, 'png');
          if (blob.size > maxBytes) throw new Error('当前 PNG 超过 8MB 限制，请改用 JPG 或缩小画板');
          result.blob = blob;
        } else {
          const compressed = await exportJpegWithinLimit({
            encode: (quality) => canvasToBlob(renderedCanvas, 'jpg', quality),
            initialQuality: .92,
            minQuality: .4,
            maxBytes
          });
          if (!compressed.ok) throw new Error('当前尺寸无法压缩到 8MB 以下');
          result.blob = compressed.blob;
        }
      }
      const name = `custom_${asset.fileName.replace(/\.[^.]+$/, '')}.${format}`;
      const saved = await saveBlobToOutputTarget(target, name, result.blob);
      setStatus(`已导出 ${saved}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导出失败');
    }
  }

  const hasImage = Boolean(asset && previewState);
  const previewScale = Math.min(760 / canvas.width, 520 / canvas.height);
  const baseGamePlan = hasImage ? buildBoardRenderPlan({ asset: asset!, spec: canvas, previewState: previewState!, brandLayer: { ...brandLayer, logoEnabled: true, cprEnabled: true, logoEffect: gameEffect, cprEffect, cprState: { ...customCprState, enabled: true, scale: 1, transform: { ...customCprState.transform, offsetX: 0, offsetY: 0 } }, logoGroup: { ...gameGroup, scale: 1, manualOffset: { x: 0, y: 0 } } }, cprAsset, gameLogoAsset: selectedGameLogo }) : undefined;
  const baseCompanyPlan = hasImage && companyLogo ? buildBoardRenderPlan({ asset: asset!, spec: canvas, previewState: previewState!, brandLayer: { ...brandLayer, logoEnabled: true, cprEnabled: false, logoEffect: companyEffect, logoGroup: { ...companyGroup, scale: 1, manualOffset: { x: 0, y: 0 } } }, companyLogoAsset: companyLogo }) : undefined;
  const baseGameRect = baseGamePlan?.layers.find((item) => item.type === 'logo')?.rect;
  const baseCompanyRect = baseCompanyPlan?.layers.find((item) => item.type === 'logo')?.rect;
  const baseCprRect = baseGamePlan?.layers.find((item) => item.type === 'cpr')?.rect;
  const gameScaleLimits = baseGameRect ? getCustomObjectScaleLimits(baseGameRect, 1, canvas) : undefined;
  const companyScaleLimits = baseCompanyRect ? getCustomObjectScaleLimits(baseCompanyRect, 1, canvas) : undefined;
  const cprScaleLimits = baseCprRect ? getCustomObjectScaleLimits(baseCprRect, 1, canvas) : undefined;
  const resolvedGameScale = gameScaleLimits ? Math.min(gameScale, gameScaleLimits.maxScale) : gameScale;
  const resolvedCompanyScale = companyScaleLimits ? Math.min(companyScale, companyScaleLimits.maxScale) : companyScale;
  const resolvedCprScale = cprScaleLimits ? Math.min(cprScale, cprScaleLimits.maxScale) : cprScale;
  const renderGameGroup = { ...gameGroup, scale: resolvedGameScale };
  const renderCompanyGroup = { ...companyGroup, scale: resolvedCompanyScale };
  const renderCprState = { ...customCprState, scale: resolvedCprScale };
  const interactionGamePlan = hasImage ? buildBoardRenderPlan({ asset: asset!, spec: canvas, previewState: previewState!, brandLayer: { ...brandLayer, logoEnabled: true, cprEnabled: true, logoEffect: gameEffect, cprEffect, cprState: { ...renderCprState, enabled: true }, logoGroup: renderGameGroup }, cprAsset, gameLogoAsset: selectedGameLogo }) : undefined;
  const companyPlan = hasImage && companyLogo ? buildBoardRenderPlan({ asset: asset!, spec: canvas, previewState: previewState!, brandLayer: { ...brandLayer, logoEnabled: true, cprEnabled: false, logoEffect: companyEffect, logoGroup: renderCompanyGroup }, companyLogoAsset: companyLogo }) : undefined;
  const cprRect = interactionGamePlan?.layers.find((item) => item.type === 'cpr')?.rect;
  const interactionItems = resolveCustomFabricItems({
    gamePlan: interactionGamePlan,
    companyPlan,
    gameEnabled,
    companyEnabled,
    cprEnabled,
    gameScale: resolvedGameScale,
    companyScale: resolvedCompanyScale,
    cprScale: resolvedCprScale,
    canvas
  });
  const selectedInteractionItem = selectedObjectId ? interactionItems.find((item) => item.id === selectedObjectId) : undefined;
  const selectedTransformBounds = selectedInteractionItem
    ? getCustomTransformBounds(selectedInteractionItem.rect, selectedInteractionItem.currentScale, canvas, selectedInteractionItem.currentScale)
    : undefined;
  const selectedScaleLimits = selectedInteractionItem
    ? getCustomObjectScaleLimits(selectedInteractionItem.rect, selectedInteractionItem.currentScale, canvas, selectedInteractionItem.minScale)
    : undefined;

  useEffect(() => {
    if (!hasImage) return;
    const game = interactionItems.find((item) => item.id === 'game');
    const company = interactionItems.find((item) => item.id === 'company');
    const cpr = interactionItems.find((item) => item.id === 'cpr');
    const differs = (left: number, right: number) => Math.abs(left - right) > .001;

    if (game) {
      const next = constrainCustomCanvasObjectTransform({ x: game.rect.x, y: game.rect.y, scale: game.currentScale }, game.rect, game.currentScale, canvas, game.minScale);
      if (differs(gameScale, next.scale) || differs(gameOffset.x, next.x) || differs(gameOffset.y, next.y)) {
        setGameScale(next.scale);
        setGameOffset({ x: next.x, y: next.y });
      }
    }
    if (company) {
      const next = constrainCustomCanvasObjectTransform({ x: company.rect.x, y: company.rect.y, scale: company.currentScale }, company.rect, company.currentScale, canvas, company.minScale);
      if (differs(companyScale, next.scale) || differs(companyOffset.x, next.x) || differs(companyOffset.y, next.y)) {
        setCompanyScale(next.scale);
        setCompanyOffset({ x: next.x, y: next.y });
      }
    }
    if (cpr) {
      const next = constrainCustomCanvasObjectTransform({ x: cpr.rect.x, y: cpr.rect.y, scale: cpr.currentScale }, cpr.rect, cpr.currentScale, canvas, cpr.minScale);
      const defaultRect = computeCprPlacementRect(canvas, { placement: 'bottom-right', offsetX: 0, offsetY: 0 }, next.scale, 'canvas');
      const patch = toCustomFabricTransformPatch('cpr', next, defaultRect);
      if (patch.cprOffset && patch.cprScale !== undefined && (differs(cprScale, patch.cprScale) || differs(cprOffset.x, patch.cprOffset.x) || differs(cprOffset.y, patch.cprOffset.y))) {
        setCprScale(patch.cprScale);
        setCprOffset(patch.cprOffset);
      }
    }
  }, [canvas.height, canvas.width, companyOffset.x, companyOffset.y, companyScale, cprOffset.x, cprOffset.y, cprScale, gameOffset.x, gameOffset.y, gameScale, hasImage, interactionItems]);

  function constrainInteractionTransform(item: CustomFabricOverlayItem, requested: CustomObjectTransform): CustomObjectTransform {
    return constrainCustomTransform(requested, item.rect, item.currentScale, canvas, item.minScale, item.maxScale);
  }

  function applyFabricTransform(id: CustomFabricObjectId, requested: CustomObjectTransform, sourceItem?: CustomFabricOverlayItem) {
    const item = sourceItem ?? interactionItems.find((candidate) => candidate.id === id);
    if (!item) return;
    const transform = constrainInteractionTransform(item, requested);
    const defaultRect = computeCprPlacementRect(canvas, { placement: 'bottom-right', offsetX: 0, offsetY: 0 }, transform.scale, 'canvas');
    const patch = toCustomFabricTransformPatch(id, transform, defaultRect);
    if (patch.gameOffset && patch.gameScale !== undefined) {
      setGameOffset(patch.gameOffset);
      setGameScale(patch.gameScale);
    }
    if (patch.companyOffset && patch.companyScale !== undefined) {
      setCompanyOffset(patch.companyOffset);
      setCompanyScale(patch.companyScale);
    }
    if (patch.cprOffset && patch.cprScale !== undefined) {
      setCprOffset(patch.cprOffset);
      setCprScale(patch.cprScale);
    }
  }

  function editSelectedTransform(patch: Partial<CustomObjectTransform>) {
    if (!selectedObjectId || !selectedInteractionItem) return;
    applyFabricTransform(selectedObjectId, {
      x: patch.x ?? selectedInteractionItem.rect.x,
      y: patch.y ?? selectedInteractionItem.rect.y,
      scale: patch.scale ?? selectedInteractionItem.currentScale
    }, selectedInteractionItem);
  }

  function snapFabricTransform(id: CustomFabricObjectId, transform: { x: number; y: number; scale: number }, item: { rect: { width: number; height: number }; currentScale: number }) {
    if (!snapEnabled || id === 'cpr') return transform;
    const multiplier = transform.scale / item.currentScale;
    const snapped = snapLogoGroupPosition(
      canvas,
      { width: item.rect.width * multiplier, height: item.rect.height * multiplier },
      transform,
      12 / previewScale,
      'canvas'
    );
    return { ...transform, x: snapped.x, y: snapped.y };
  }

  function resetSelectedObject() {
    if (selectedObjectId === 'game') {
      editSelectedTransform({ x: 460, y: 216, scale: 1 });
    } else if (selectedObjectId === 'company') {
      editSelectedTransform({ x: 1036, y: 216, scale: 1 });
    } else if (selectedObjectId === 'cpr') {
      const defaultRect = computeCprPlacementRect(canvas, { placement: 'bottom-right', offsetX: 0, offsetY: 0 }, 1, 'canvas');
      editSelectedTransform({ x: defaultRect.x, y: defaultRect.y, scale: 1 });
    }
  }

  const canvasOption = getCustomCanvasOptionValue(canvasSelection);

  return <section className="custom-workspace" aria-label="自定义工作区">
    <header className="custom-workspace-toolbar">
      <div className="custom-section-title">自定义构图</div>
      <CustomExportControls format={format} disabled={!hasImage} status={status} onFormatChange={setFormat} onExport={() => void exportCurrent()} />
    </header>
    <aside className="custom-controls">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void importAsset(event.target.files)} />
      <button type="button" className="primary-button" onClick={() => inputRef.current?.click()} title="导入一张图片开始自定义构图">
        导入图片
      </button>

      {!hasImage ? (
        <div className="custom-empty">
          <strong>未导入图片</strong>
          <p>导入图片后可自由摆放游戏 Logo、公司 Logo 与 CPR。拖拽为主，数值输入用于精调；支持参考线、网格吸附和高级效果。</p>
        </div>
      ) : (
        <>
          <div className="brand-control-group">
            <div className="section-header is-idle" data-section-state="idle">
              <div><h3><span className="section-state-dot" aria-hidden="true" />画布与底图</h3><small>{canvas.width} × {canvas.height}</small></div>
            </div>
            <label className="control-row"><span>尺寸</span><select aria-label="自定义画布尺寸" value={canvasOption} onChange={(event) => selectCanvasSize(event.target.value)}>
              <option value="source">原图尺寸（跟随底图）</option>
              {CUSTOM_MANUAL_CANVAS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              <option value={CUSTOM_CANVAS_OPTION}>自定义尺寸</option>
            </select></label>
            {canvasOption === CUSTOM_CANVAS_OPTION ? <div className="custom-canvas-dimensions" aria-label="自定义画布宽高">
              <label><span>宽</span><input aria-label="自定义画布宽度" inputMode="numeric" type="number" min="1" max={MAX_CUSTOM_CANVAS_EDGE} step="1" value={customWidthDraft} onChange={(event) => setCustomWidthDraft(event.target.value)} onBlur={commitCustomCanvasSize} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
              <span aria-hidden="true">×</span>
              <label><span>高</span><input aria-label="自定义画布高度" inputMode="numeric" type="number" min="1" max={MAX_CUSTOM_CANVAS_EDGE} step="1" value={customHeightDraft} onChange={(event) => setCustomHeightDraft(event.target.value)} onBlur={commitCustomCanvasSize} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
            </div> : null}
            <div className="segmented-control" aria-label="底图适配方式">
              <button type="button" className={previewState?.fitMode === 'contain' ? 'active' : ''} onClick={() => updateCropMode('contain')}>适合画布</button>
              <button type="button" className={previewState?.fitMode === 'cover' ? 'active' : ''} onClick={() => updateCropMode('cover')}>填满画布</button>
            </div>
            <button type="button" className={cropEditing ? 'active' : ''} onClick={() => setCropEditing((value) => !value)}>{cropEditing ? '完成底图调整' : '调整底图'}</button>
            {cropEditing ? <>
              <label className="range-field custom-number-field"><span>素材缩放</span><input aria-label="素材缩放数值" type="number" min={computeFitScale(asset!, canvas, previewState!.fitMode)} max={computeFitScale(asset!, canvas, 'cover') * 6} step="0.01" value={Number(previewState!.crop.scale.toFixed(3))} onChange={(event) => updateCropScale(Math.max(computeFitScale(asset!, canvas, previewState!.fitMode), Number(event.target.value) || computeFitScale(asset!, canvas, previewState!.fitMode)))} /></label>
              <small className="inline-note">拖动画布中的底图调整位置</small>
              <button type="button" onClick={resetCrop}>裁切复位</button>
            </> : null}
          </div>
          <div className="brand-control-group">
            <div className="section-header is-idle" data-section-state="idle">
              <div><h3><span className="section-state-dot" aria-hidden="true" />固定对象</h3><small>点击画布对象或在此选择</small></div>
            </div>
            <div className="custom-object-selector" role="group" aria-label="选择固定对象">
              <button type="button" className={selectedObjectId === 'game' ? 'active' : ''} onClick={() => { setCropEditing(false); setSelectedObjectId('game'); }}>游戏 Logo</button>
              <button type="button" className={selectedObjectId === 'company' ? 'active' : ''} onClick={() => { setCropEditing(false); setSelectedObjectId('company'); }}>公司 Logo</button>
              <button type="button" className={selectedObjectId === 'cpr' ? 'active' : ''} onClick={() => { setCropEditing(false); setSelectedObjectId('cpr'); }}>CPR</button>
            </div>
          </div>

          <div className="brand-control-group">
            <div className="section-header is-idle" data-section-state="idle">
              <div><h3><span className="section-state-dot" aria-hidden="true" />{selectedObjectId === 'game' ? '游戏 Logo' : selectedObjectId === 'company' ? '公司 Logo' : selectedObjectId === 'cpr' ? 'CPR' : '当前对象'}</h3><small>{selectedObjectId ? '拖动与四角等比缩放；数值用于精调' : '请点击画布中的 Logo 或 CPR'}</small></div>
            </div>
            {selectedObjectId === 'game' ? <>
              <label className="toggle"><input type="checkbox" checked={gameEnabled} onChange={(event) => setGameEnabled(event.target.checked)} />显示游戏 Logo</label>
              <label className="control-row"><span>语种</span><select value={gameLanguage} onChange={(event) => setGameLanguage(event.target.value as BrandLanguage)}>{gameLogos.map((item) => <option key={item.id} value={item.language}>{getBrandLanguageLabel(item.language)}</option>)}</select></label>
              {numberControl('缩放', selectedInteractionItem?.currentScale ?? resolvedGameScale, selectedScaleLimits?.minScale ?? .01, selectedScaleLimits?.maxScale ?? resolvedGameScale, .01, (scale) => editSelectedTransform({ scale }))}
              {numberControl('X', selectedInteractionItem?.rect.x ?? 0, 0, selectedTransformBounds?.maxX ?? 0, 1, (x) => editSelectedTransform({ x }))}
              {numberControl('Y', selectedInteractionItem?.rect.y ?? 0, 0, selectedTransformBounds?.maxY ?? 0, 1, (y) => editSelectedTransform({ y }))}
              <small className="inline-note">{fmtScale(selectedInteractionItem?.currentScale ?? resolvedGameScale)} · ({fmtCoord(selectedInteractionItem?.rect.x ?? 0)}, {fmtCoord(selectedInteractionItem?.rect.y ?? 0)})</small>
              <button type="button" onClick={resetSelectedObject}>复位</button>
              <CustomObjectEffectDisclosure title="游戏 Logo" effect={gameEffect} onChange={setGameEffect} />
            </> : null}
            {selectedObjectId === 'company' ? <>
              <label className="toggle"><input type="checkbox" checked={companyEnabled} onChange={(event) => setCompanyEnabled(event.target.checked)} />显示公司 Logo</label>
              {numberControl('缩放', selectedInteractionItem?.currentScale ?? resolvedCompanyScale, selectedScaleLimits?.minScale ?? .01, selectedScaleLimits?.maxScale ?? resolvedCompanyScale, .01, (scale) => editSelectedTransform({ scale }))}
              {numberControl('X', selectedInteractionItem?.rect.x ?? 0, 0, selectedTransformBounds?.maxX ?? 0, 1, (x) => editSelectedTransform({ x }))}
              {numberControl('Y', selectedInteractionItem?.rect.y ?? 0, 0, selectedTransformBounds?.maxY ?? 0, 1, (y) => editSelectedTransform({ y }))}
              <small className="inline-note">{fmtScale(selectedInteractionItem?.currentScale ?? resolvedCompanyScale)} · ({fmtCoord(selectedInteractionItem?.rect.x ?? 0)}, {fmtCoord(selectedInteractionItem?.rect.y ?? 0)})</small>
              <button type="button" onClick={resetSelectedObject}>复位</button>
              <CustomObjectEffectDisclosure title="公司 Logo" effect={companyEffect} onChange={setCompanyEffect} />
            </> : null}
            {selectedObjectId === 'cpr' ? <>
              <label className="toggle"><input type="checkbox" checked={cprEnabled} onChange={(event) => setCprEnabled(event.target.checked)} />显示 CPR</label>
              {numberControl('缩放', selectedInteractionItem?.currentScale ?? resolvedCprScale, selectedScaleLimits?.minScale ?? .01, selectedScaleLimits?.maxScale ?? resolvedCprScale, .01, (scale) => editSelectedTransform({ scale }))}
              {numberControl('X', selectedInteractionItem?.rect.x ?? cprRect?.x ?? 0, 0, selectedTransformBounds?.maxX ?? 0, 1, (x) => editSelectedTransform({ x }))}
              {numberControl('Y', selectedInteractionItem?.rect.y ?? cprRect?.y ?? 0, 0, selectedTransformBounds?.maxY ?? 0, 1, (y) => editSelectedTransform({ y }))}
              <small className="inline-note">{fmtScale(selectedInteractionItem?.currentScale ?? resolvedCprScale)} · ({fmtCoord(selectedInteractionItem?.rect.x ?? cprRect?.x ?? 0)}, {fmtCoord(selectedInteractionItem?.rect.y ?? cprRect?.y ?? 0)})</small>
              <button type="button" onClick={resetSelectedObject}>复位</button>
              <CustomObjectEffectDisclosure title="CPR" effect={cprEffect} onChange={setCprEffect} />
            </> : null}
          </div>

          {/* ── Assist ── */}
          <div className="brand-control-group">
            <div className="section-header is-idle" data-section-state="idle">
              <div><h3><span className="section-state-dot" aria-hidden="true" />辅助显示</h3><small>参考线与吸附</small></div>
            </div>
            <label className="toggle"><input type="checkbox" checked={guidesVisible} onChange={(event) => setGuidesVisible(event.target.checked)} />参考线</label>
            <label className="toggle"><input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} />网格吸附</label>
          </div>

        </>
      )}
    </aside>
    <div className="custom-stage">
      {asset && previewState ? <div className="custom-canvas-stack">
        {guidesVisible ? <div className="custom-guides"><span /><span /></div> : null}
        <BoardCanvas
          asset={asset}
          spec={canvas}
          previewState={previewState}
          logoAsset={logoAsset}
          cprAsset={cprAsset}
          brandLayer={{ ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: renderCprState, logoGroup: renderGameGroup }}
          scale={previewScale}
          overlayGameLogo={gameEnabled ? selectedGameLogo : undefined}
          draggable={cropEditing}
          onPointerDown={cropEditing ? onCropPointerDown : undefined}
          onPointerMove={cropEditing ? onCropPointerMove : undefined}
          onPointerUp={cropEditing ? stopCropDrag : undefined}
        />
        {companyEnabled ? <BoardCanvas
          asset={asset}
          spec={canvas}
          previewState={previewState}
          logoAsset={logoAsset}
          cprAsset={undefined}
          brandLayer={{ ...brandLayer, logoEnabled: true, cprEnabled: false, logoEffect: companyEffect, logoGroup: renderCompanyGroup }}
          scale={previewScale}
          showImage={false}
          transparent
          overlayCompanyLogo={companyLogo}
        /> : null}
        <CustomFabricOverlay
          canvas={canvas}
          previewScale={previewScale}
          items={interactionItems}
          selectedId={selectedObjectId}
          onSelectedIdChange={setSelectedObjectId}
          onTransformChange={applyFabricTransform}
          onSnapTransform={snapFabricTransform}
          onError={setStatus}
          disabled={cropEditing}
        />
      </div> : <div className="custom-empty"><strong>导入一张图片开始自定义构图</strong></div>}
    </div>
  </section>;
}
