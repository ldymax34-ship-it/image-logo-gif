import { type PointerEvent, useEffect, useRef, useState } from 'react';
import {
  buildBrandRenderPlan, clampCropState, classifyAspect, computeFitScale, createInitialCropState,
  panCropState, snapLogoGroupPosition, zoomCropState,
  type BoardPreviewState, type BrandAsset, type BrandLayerState, type BrandSettingsV1,
  type CprState, type CropState, type FitMode, type LogoGroupState, type MaterialAsset, type MaterialSpec
} from '../../core';
import { FocusEditor } from '../../components/FocusEditor';
import { BoardCanvas } from '../../components/canvas';

function getAspectLabel(spec: MaterialSpec): string {
  const family = classifyAspect({ width: spec.width, height: spec.height });
  if (family === 'landscape') return 'landscape / 横版';
  if (family === 'portrait') return 'portrait / 竖版';
  return 'square / 方图';
}

function createPreviewState(asset: MaterialAsset, spec: MaterialSpec, fitMode: FitMode): BoardPreviewState {
  return { assetId: asset.id, specId: spec.id, crop: createInitialCropState(asset, spec, fitMode), fitMode };
}

export function isFocusEditorDirty(initialState: BoardPreviewState | undefined, draftState: BoardPreviewState | undefined, logoGroup: LogoGroupState, draftLogoGroup: LogoGroupState, cprState: CprState, draftCprState: CprState): boolean {
  return Boolean(initialState && draftState && (initialState.fitMode !== draftState.fitMode || initialState.crop.scale !== draftState.crop.scale || initialState.crop.offsetX !== draftState.crop.offsetX || initialState.crop.offsetY !== draftState.crop.offsetY || JSON.stringify(logoGroup) !== JSON.stringify(draftLogoGroup) || JSON.stringify(cprState) !== JSON.stringify(draftCprState)));
}

export function FocusEditorModal({ asset, spec, previewState, logoAsset, cprAsset, brandLayer, brandSettings, logoGroup, cprState, overlayCompanyLogo, overlayGameLogo, onCancel, onSave, onApplyToSameAspect, onDirtyChange }: {
  asset: MaterialAsset | undefined; spec: MaterialSpec; previewState: BoardPreviewState | undefined;
  logoAsset: BrandAsset | undefined; cprAsset: BrandAsset | undefined; brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1; logoGroup: LogoGroupState; cprState: CprState;
  overlayCompanyLogo?: BrandAsset; overlayGameLogo?: BrandAsset; onCancel: () => void;
  onSave: (previewState: BoardPreviewState, logoGroup: LogoGroupState, cprState: CprState) => void;
  onApplyToSameAspect: (logoGroup: LogoGroupState) => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const dragRef = useRef<
    | { kind: 'crop'; pointerId: number; x: number; y: number }
    | { kind: 'brand' | 'cpr'; pointerId: number; x: number; y: number; originX: number; originY: number; width: number; height: number; startOffsetX?: number; startOffsetY?: number }
    | null
  >(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const initialState = previewState ?? (asset ? createPreviewState(asset, spec, 'cover') : undefined);
  const [draftState, setDraftState] = useState<BoardPreviewState | undefined>(initialState);
  const [draftLogoGroup, setDraftLogoGroup] = useState<LogoGroupState>(logoGroup);
  const [draftCprState, setDraftCprState] = useState<CprState>(cprState);
  const [editMode, setEditMode] = useState<'crop' | 'brand' | 'cpr'>('crop');
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
  const dirty = isFocusEditorDirty(initialState, draftState, logoGroup, draftLogoGroup, cprState, draftCprState);

  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);

  function updateCrop(nextCrop: CropState) {
    if (asset && draftState) setDraftState({ ...draftState, crop: clampCropState(asset, spec, nextCrop, draftState.fitMode) });
  }
  function setFitMode(mode: FitMode) { if (asset) setDraftState(createPreviewState(asset, spec, mode)); }
  function requestClose() { if (dirty) setConfirmDiscard(true); else onCancel(); }
  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!asset || !draftState) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (editMode === 'brand' || editMode === 'cpr') {
      const plan = buildBrandRenderPlan({ width: spec.width, height: spec.height }, draftLogoGroup, { companyLogo: overlayCompanyLogo, gameLogo: overlayGameLogo, cpr: draftCprState });
      const rect = editMode === 'brand' ? plan.logoGroupRect : plan.cpr?.rect;
      if (!rect) return;
      dragRef.current = { kind: editMode, pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: rect.x, originY: rect.y, width: rect.width, height: rect.height, startOffsetX: editMode === 'cpr' ? draftCprState.transform.offsetX : undefined, startOffsetY: editMode === 'cpr' ? draftCprState.transform.offsetY : undefined };
      return;
    }
    dragRef.current = { kind: 'crop', pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!asset || !draftState || !drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === 'brand' || drag.kind === 'cpr') {
      const raw = { x: drag.originX + (event.clientX - drag.x) / stageScale, y: drag.originY + (event.clientY - drag.y) / stageScale };
      const next = brandSettings.snapEnabled ? snapLogoGroupPosition({ width: spec.width, height: spec.height }, { width: drag.width, height: drag.height }, raw, brandSettings.snapThreshold / stageScale) : raw;
      if (drag.kind === 'brand') setDraftLogoGroup((previous) => ({ ...previous, placement: 'custom', manualOffset: { x: next.x, y: next.y } }));
      else setDraftCprState((previous) => ({ ...previous, transform: { placement: 'custom', offsetX: (drag.startOffsetX ?? 0) + next.x - drag.originX, offsetY: (drag.startOffsetY ?? 0) + next.y - drag.originY } }));
      return;
    }
    const deltaX = (event.clientX - drag.x) / stageScale;
    const deltaY = (event.clientY - drag.y) / stageScale;
    dragRef.current = { kind: 'crop', pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setDraftState({ ...draftState, crop: panCropState(asset, spec, draftState.crop, deltaX, deltaY, draftState.fitMode) });
  }
  function handlePointerUp(event: PointerEvent<HTMLDivElement>) { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; }

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); requestClose(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; closeButtonRef.current?.focus(); document.addEventListener('keydown', handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKeyDown); };
  }, [dirty]);

  return <FocusEditor onBackdropClose={requestClose} labelledBy="focus-dialog-title" describedBy="focus-dialog-help"><section ref={dialogRef}>
    <div className="dialog-header"><div><span className="dialog-kicker">画板调整</span><h2 id="focus-dialog-title">{spec.name}</h2><small>{spec.width} x {spec.height} · {getAspectLabel(spec)}</small></div><button ref={closeButtonRef} type="button" className="icon-button" onClick={requestClose} aria-label="关闭画板调整" title="关闭">×</button></div>
    <div className="focus-dialog-body"><div className="focus-stage-frame"><BoardCanvas asset={asset} spec={spec} previewState={draftState} logoAsset={logoAsset} cprAsset={cprAsset} brandLayer={{ ...brandLayer, logoGroup: draftLogoGroup, cprState: draftCprState, cprEnabled: draftCprState.enabled }} scale={stageScale} draggable={Boolean(asset)} brandSettings={brandSettings} logoGroup={draftLogoGroup} overlayCompanyLogo={overlayCompanyLogo} overlayGameLogo={overlayGameLogo} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} /></div>
      <div className="focus-side-controls"><div><span className="control-label">调整对象</span><div className="segmented-control"><button type="button" className={editMode === 'crop' ? 'active' : ''} onClick={() => setEditMode('crop')}>图片裁切</button><button type="button" className={editMode === 'brand' ? 'active' : ''} onClick={() => setEditMode('brand')}>品牌位置</button><button type="button" className={editMode === 'cpr' ? 'active' : ''} onClick={() => setEditMode('cpr')}>CPR 位置</button></div></div>
        <div><span className="control-label">填充方式</span><div className="segmented-control"><button type="button" className={draftState?.fitMode === 'cover' ? 'active' : ''} onClick={() => setFitMode('cover')} disabled={!asset}>填满画布</button><button type="button" className={draftState?.fitMode === 'contain' ? 'active' : ''} onClick={() => setFitMode('contain')} disabled={!asset}>适应画布</button></div></div>
        <label className="focus-range-field"><span className="control-label">缩放</span><input type="range" min={sliderMinScale} max={maxScale} step={Math.max(sliderMinScale / 100, .001)} value={crop?.scale ?? sliderMinScale} disabled={!asset || !crop || !draftState} onChange={(event) => { if (asset && crop && draftState) updateCrop(zoomCropState(asset, spec, crop, Number(event.target.value), { x: spec.width / 2, y: spec.height / 2 }, draftState.fitMode)); }} /></label>
        {editMode === 'brand' ? <label className="focus-range-field"><span className="control-label">Logo 大小 {Math.round((draftLogoGroup.scale ?? 1) * 100)}%</span><input type="range" min="0.5" max="2" step="0.01" value={draftLogoGroup.scale ?? 1} onChange={(event) => setDraftLogoGroup((previous) => ({ ...previous, scale: Number(event.target.value) }))} /></label> : null}
        <button type="button" onClick={() => setFitMode(draftState?.fitMode ?? 'cover')} disabled={!asset}>重置当前裁切</button><button type="button" onClick={() => onApplyToSameAspect(draftLogoGroup)} disabled={!asset}>应用品牌位置到同版型</button><p id="focus-dialog-help" className="dialog-help">切换调整对象后拖动画布。Logo 与 CPR 都会按网格和参考点吸附；CPR 会保存为当前画板的独立位置。</p></div></div>
    {confirmDiscard ? <div className="discard-confirm" role="alert"><span>当前调整尚未保存，确定放弃吗？</span><button type="button" onClick={() => setConfirmDiscard(false)}>继续调整</button><button type="button" className="danger-button" onClick={onCancel}>放弃修改</button></div> : <div className="dialog-footer"><span>{dirty ? '有未保存的调整' : '当前画板未修改'}</span><div className="dialog-actions"><button type="button" onClick={requestClose}>取消</button><button type="button" className="primary-button" onClick={() => draftState && onSave(draftState, draftLogoGroup, draftCprState)} disabled={!draftState || !asset}>保存并返回</button></div></div>}
  </section></FocusEditor>;
}
