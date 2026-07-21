import { type PointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  buildBrandRenderPlan,
  createInitialCropState,
  clampCropState,
  computeFitScale,
  panCropState,
  resolveBoardBrandAssets,
  snapLogoGroupPosition,
  zoomCropState,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1,
  type MaterialAsset,
  type MaterialSpec
} from '../../core';
import { BoardCanvas } from '../../components/canvas';
import type { FocusSession } from './focusSession';
import { updateFocusCpr, updateFocusLogo, withFocusDraft } from './focusSession';

const MIN_VIEW_ZOOM = 25;
const MAX_VIEW_ZOOM = 300;
const VIEW_ZOOM_STEP = 25;

export function clampFocusViewZoom(percent: number): number {
  return Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, Math.round(percent)));
}

export function getFocusHitTarget(point: { x: number; y: number }, plan: ReturnType<typeof buildBrandRenderPlan>): FocusSession['tool'] {
  const contains = (rect: { x: number; y: number; width: number; height: number } | undefined) => Boolean(rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
  return contains(plan.cpr?.rect) ? 'cpr' : contains(plan.logoGroupRect) ? 'logo' : 'crop';
}

export function FocusWorkspace({
  asset,
  spec,
  session,
  brandCatalog,
  brandLayer,
  brandSettings,
  brandControls,
  onSessionChange,
  onCancel,
  onCommit,
  pendingModuleChange,
  onSaveAndLeave,
  onDiscardAndLeave,
  onCancelModuleChange
}: {
  asset: MaterialAsset;
  spec: MaterialSpec;
  session: FocusSession;
  brandCatalog: BrandAsset[];
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  brandControls: ReactNode;
  onSessionChange: (session: FocusSession) => void;
  onCancel: () => void;
  onCommit: (session: FocusSession) => void;
  pendingModuleChange?: string;
  onSaveAndLeave?: () => void;
  onDiscardAndLeave?: () => void;
  onCancelModuleChange?: () => void;
}) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; kind: FocusSession['tool']; originX?: number; originY?: number }>();
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewZoom, setViewZoom] = useState(100);
  const [stageBounds, setStageBounds] = useState({ width: 820, height: 560 });
  const draftBrandLayer = { ...brandLayer, ...session.draft.brandLayer, logoEffect: session.draft.brandLayer.logoEffect };
  const assets = resolveBoardBrandAssets({ boardBrandState: session.draft.brand, brandCatalog, brandLayer: draftBrandLayer });
  const fitViewScale = Math.min(Math.max(1, stageBounds.width - 36) / spec.width, Math.max(1, stageBounds.height - 36) / spec.height, 1.6);
  const stageScale = fitViewScale * (viewZoom / 100);
  const crop = session.draft.previewState.crop;
  const minScale = computeFitScale(asset, spec, session.draft.previewState.fitMode);
  const maxScale = minScale * 6;
  const selectionPlan = buildBrandRenderPlan({ width: spec.width, height: spec.height }, session.draft.brand.logo, { companyLogo: assets.companyLogo, gameLogo: assets.gameLogo, cpr: session.draft.brand.cpr });
  const selectionRect = session.tool === 'logo' ? selectionPlan.logoGroupRect : session.tool === 'cpr' ? selectionPlan.cpr?.rect : undefined;
  const selectionLabel = session.tool === 'logo' ? 'Logo' : session.tool === 'cpr' ? 'CPR' : '图片裁切';

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (session.dirty) setConfirmDiscard(true);
        else onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, session.dirty]);

  useLayoutEffect(() => {
    const stage = stageFrameRef.current;
    if (!stage) return;
    const syncBounds = () => setStageBounds({ width: stage.clientWidth, height: stage.clientHeight });
    syncBounds();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncBounds);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  function updateCrop(scale: number) {
    const nextCrop = zoomCropState(asset, spec, crop, scale, { x: spec.width / 2, y: spec.height / 2 }, session.draft.previewState.fitMode);
    onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, crop: clampCropState(asset, spec, nextCrop, session.draft.previewState.fitMode) } }));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) / stageScale, y: (event.clientY - bounds.top) / stageScale };
    const plan = buildBrandRenderPlan({ width: spec.width, height: spec.height }, session.draft.brand.logo, { companyLogo: assets.companyLogo, gameLogo: assets.gameLogo, cpr: session.draft.brand.cpr });
    const tool = getFocusHitTarget(point, plan);
    if (tool !== session.tool) onSessionChange({ ...session, tool });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, kind: tool };
    setDragging(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.x) / stageScale;
    const dy = (event.clientY - drag.y) / stageScale;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.kind === 'crop') {
      const nextCrop = panCropState(asset, spec, session.draft.previewState.crop, dx, dy, session.draft.previewState.fitMode);
      onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, crop: nextCrop } }));
      return;
    }
    if (drag.kind === 'logo') {
      const plan = buildBrandRenderPlan({ width: spec.width, height: spec.height }, session.draft.brand.logo, { companyLogo: assets.companyLogo, gameLogo: assets.gameLogo, cpr: session.draft.brand.cpr });
      const rect = plan.logoGroupRect;
      if (!rect) return;
      const raw = { x: rect.x + dx, y: rect.y + dy };
      const next = brandSettings.snapEnabled ? snapLogoGroupPosition({ width: spec.width, height: spec.height }, rect, raw, brandSettings.snapThreshold / stageScale) : raw;
      onSessionChange(updateFocusLogo(session, { ...session.draft.brand.logo, placement: 'custom', manualOffset: next }));
      return;
    }
    const nextCpr = { ...session.draft.brand.cpr, transform: { ...session.draft.brand.cpr.transform, placement: 'custom' as const, offsetX: session.draft.brand.cpr.transform.offsetX + dx, offsetY: session.draft.brand.cpr.transform.offsetY + dy } };
    onSessionChange(updateFocusCpr(session, nextCpr));
  }

  return <section className="focus-workspace" aria-label="画板聚焦工作区">
    <div className="focus-workspace-header">
      <div><span className="dialog-kicker">画板调整</span><h2>{spec.name}</h2><small>{spec.width} x {spec.height}</small></div>
      <div className="dialog-actions"><button type="button" onClick={() => session.dirty ? setConfirmDiscard(true) : onCancel()}>取消</button><button type="button" className="primary-button" onClick={() => onCommit(session)}>保存并返回</button></div>
    </div>
    <div className="focus-workspace-body">
      <aside className="focus-brand-controls">{brandControls}</aside>
      <div ref={stageFrameRef} className={`focus-stage-frame is-editing-${session.tool} ${dragging ? 'is-dragging' : ''}`}>
        <div className="focus-canvas-wrapper">
        <BoardCanvas
          asset={asset}
          spec={spec}
          previewState={session.draft.previewState}
          logoAsset={assets.gameLogo}
          cprAsset={assets.cpr}
          brandLayer={{ ...draftBrandLayer, logoGroup: session.draft.brand.logo, cprState: session.draft.brand.cpr, cprEnabled: session.draft.brand.cpr.enabled }}
          brandSettings={brandSettings}
          overlayCompanyLogo={assets.companyLogo}
          overlayGameLogo={assets.gameLogo}
          scale={stageScale}
          draggable
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { dragRef.current = undefined; setDragging(false); }}
        />
        {selectionRect ? <div className="focus-selection-outline" aria-live="polite" style={{ left: selectionRect.x * stageScale, top: selectionRect.y * stageScale, width: selectionRect.width * stageScale, height: selectionRect.height * stageScale }}><span>{dragging ? `正在拖动${selectionLabel}` : selectionLabel}</span></div> : <div className="focus-selection-hint">图片裁切</div>}
        </div>
      </div>
      <aside className="focus-side-controls">
        <div className="focus-view-zoom" aria-label="查看倍率">
          <span className="control-label">查看倍率</span>
          <div className="focus-view-zoom-controls">
            <button type="button" aria-label="缩小查看倍率" onClick={() => setViewZoom((value) => clampFocusViewZoom(value - VIEW_ZOOM_STEP))} disabled={viewZoom <= MIN_VIEW_ZOOM}>−</button>
            <output aria-live="polite">{viewZoom}%</output>
            <button type="button" aria-label="放大查看倍率" onClick={() => setViewZoom((value) => clampFocusViewZoom(value + VIEW_ZOOM_STEP))} disabled={viewZoom >= MAX_VIEW_ZOOM}>+</button>
          </div>
          <input aria-label="查看倍率滑块" type="range" min={MIN_VIEW_ZOOM} max={MAX_VIEW_ZOOM} step="1" value={viewZoom} onChange={(event) => setViewZoom(clampFocusViewZoom(Number(event.target.value)))} />
          <button type="button" className="focus-view-fit-button" onClick={() => setViewZoom(100)}>适合窗口 / 100%</button>
          <small className="inline-note">仅影响查看，不会修改裁切、品牌位置或导出。</small>
        </div>
        {session.tool === 'crop' ? <><div><span className="control-label">填充方式</span><div className="segmented-control"><button type="button" className={session.draft.previewState.fitMode === 'cover' ? 'active' : ''} onClick={() => onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, fitMode: 'cover' } }))}>填满画布</button><button type="button" className={session.draft.previewState.fitMode === 'contain' ? 'active' : ''} onClick={() => onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, fitMode: 'contain' } }))}>适应画布</button></div></div><label className="focus-range-field"><span className="control-label">缩放</span><input type="range" min={minScale} max={maxScale} step={Math.max(minScale / 100, .001)} value={crop.scale} onChange={(event) => updateCrop(Number(event.target.value))} /></label><button type="button" onClick={() => onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, crop: createInitialCropState(asset, spec, session.draft.previewState.fitMode) } }))}>裁切复位</button></> : null}
        <p className="dialog-help">聚焦期间所有修改均保存在草稿中；保存前不会写入画板。</p>
      </aside>
    </div>
    {pendingModuleChange ? <div className="focus-discard-confirm" role="alert"><span>当前调整尚未保存。保存后切换到{pendingModuleChange}吗？</span><button type="button" onClick={onCancelModuleChange}>取消</button><button type="button" className="danger-button" onClick={onDiscardAndLeave}>放弃</button><button type="button" className="primary-button" onClick={onSaveAndLeave}>保存</button></div> : confirmDiscard ? <div className="focus-discard-confirm" role="alert"><span>当前调整尚未保存，确定放弃吗？</span><button type="button" onClick={() => setConfirmDiscard(false)}>继续调整</button><button type="button" className="danger-button" onClick={onCancel}>放弃修改</button></div> : null}
  </section>;
}
