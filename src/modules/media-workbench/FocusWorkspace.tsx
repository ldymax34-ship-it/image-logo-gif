import { type PointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  buildBrandRenderPlan,
  createInitialCropState,
  clampCropState,
  computeFitScale,
  getLogoPlacementBounds,
  panCropState,
  resolveBoardBrandAssets,
  snapLogoGroupPosition,
  zoomCropState,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1,
  type LogoConstraintMode,
  type MaterialAsset,
  type MaterialSpec
} from '../../core';
import { BoardCanvas } from '../../components/canvas';
import type { FocusSession } from './focusSession';
import {
  centerViewportOnCanvasPoint,
  clampFocusViewport,
  computeZoomViewport,
  computeZoomViewportFromStage,
  createFitViewport,
  getFocusFitZoom,
  getFocusViewScale,
  pointerToCanvasPoint,
  type ViewportState
} from './focusCoords';
import { updateFocusCpr, updateFocusLogo, withFocusDraft } from './focusSession';
import { FocusLogoFabricOverlay } from './FocusLogoFabricOverlay';

const MIN_VIEW_ZOOM = 25;
const MAX_VIEW_ZOOM = 300;
const VIEW_ZOOM_STEP = 25;

export const TOOL_HINTS: Record<FocusSession['tool'], string> = {
  crop: '拖动画面裁切 · 滚轮缩放查看 · Space / 中键平移',
  logo: '拖动 Logo · 方向键 1px · Shift + 方向键 10px',
  cpr: '拖动 CPR · 左侧调整大小与颜色 · Space / 中键平移'
};

export const TOOL_HINT_DETAILS: Record<FocusSession['tool'], string> = {
  crop: '拖动画面移动素材；右侧“素材缩放”调整底图大小；滚轮缩放查看；按住 Space 拖动或使用中键平移视图。',
  logo: '拖动 Logo 调整位置；方向键微调 1px；Shift + 方向键微调 10px；滚轮只改变查看倍率。',
  cpr: '拖动 CPR 调整位置；左侧调整大小与颜色；滚轮缩放查看；按住 Space 拖动或使用中键平移视图。'
};

export function clampFocusViewZoom(percent: number): number {
  return Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, Math.round(percent)));
}

function wheelSensitivityFactor(setting: 'low' | 'standard' | 'high'): number {
  if (setting === 'low') return 0.5;
  if (setting === 'high') return 2;
  return 1;
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
  onCancelModuleChange,
  onApplyCropSameSize
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
  onApplyCropSameSize?: () => void;
}) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; kind: FocusSession['tool'] | 'pan'; originX?: number; originY?: number }>();
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focusLogoFabricFailed, setFocusLogoFabricFailed] = useState(false);
  const [viewport, setViewport] = useState<ViewportState>(() => createFitViewport({ width: 820, height: 560 }, spec));
  const [stageBounds, setStageBounds] = useState({ width: 820, height: 560 });
  const [spacePressed, setSpacePressed] = useState(false);
  const draftBrandLayer = { ...brandLayer, ...session.draft.brandLayer, logoEffect: session.draft.brandLayer.logoEffect };
  const assets = resolveBoardBrandAssets({ boardBrandState: session.draft.brand, brandCatalog, brandLayer: draftBrandLayer });
  const stageScale = getFocusViewScale(viewport.zoom);
  const crop = session.draft.previewState.crop;
  const minScale = computeFitScale(asset, spec, session.draft.previewState.fitMode);
  const maxScale = minScale * 6;
  const selectionPlan = buildBrandRenderPlan({ width: spec.width, height: spec.height }, session.draft.brand.logo, { companyLogo: assets.companyLogo, gameLogo: assets.gameLogo, cpr: session.draft.brand.cpr });
  const selectionRect = session.tool === 'logo' ? selectionPlan.logoGroupRect : session.tool === 'cpr' ? selectionPlan.cpr?.rect : undefined;
  const selectionLabel = session.tool === 'logo' ? 'Logo' : session.tool === 'cpr' ? 'CPR' : '图片裁切';
  const constraintMode = session.draft.brand.logo.constraintMode ?? 'safe-area';
  const bounds = selectionRect ? getLogoPlacementBounds({ width: spec.width, height: spec.height }, selectionRect, constraintMode) : undefined;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (session.dirty) setConfirmDiscard(true);
        else onCancel();
        return;
      }
      if (event.key === ' ' && !spacePressed) {
        event.preventDefault();
        setSpacePressed(true);
        return;
      }
      if (session.tool === 'logo' && selectionRect) {
        const step = event.shiftKey ? 10 : 1;
        const logo = session.draft.brand.logo;
        if (logo.placement !== 'custom') return;
        let dx = 0;
        let dy = 0;
        if (event.key === 'ArrowLeft') dx = -step;
        else if (event.key === 'ArrowRight') dx = step;
        else if (event.key === 'ArrowUp') dy = -step;
        else if (event.key === 'ArrowDown') dy = step;
        if (dx !== 0 || dy !== 0) {
          event.preventDefault();
          const nextOffset = { x: (logo.manualOffset?.x ?? selectionRect.x) + dx, y: (logo.manualOffset?.y ?? selectionRect.y) + dy };
          onSessionChange(updateFocusLogo(session, { ...logo, placement: 'custom', manualOffset: nextOffset }));
        }
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === ' ') setSpacePressed(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [onCancel, session, selectionRect, spacePressed]);

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

  useEffect(() => {
    setViewport((previous) => previous.mode === 'fit'
      ? createFitViewport(stageBounds, spec)
      : clampFocusViewport(previous, stageBounds, spec));
  }, [spec.height, spec.width, stageBounds]);

  function updateCrop(scale: number) {
    const nextCrop = zoomCropState(asset, spec, crop, scale, { x: spec.width / 2, y: spec.height / 2 }, session.draft.previewState.fitMode);
    onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, crop: clampCropState(asset, spec, nextCrop, session.draft.previewState.fitMode) } }));
  }

  function isPanPointer(event: PointerEvent<HTMLDivElement>): boolean {
    return spacePressed || event.button === 1 || (event.buttons & 4) !== 0;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const point = pointerToCanvasPoint(event.clientX, event.clientY, { left: canvasRect.left, top: canvasRect.top }, stageScale);
    const plan = buildBrandRenderPlan({ width: spec.width, height: spec.height }, session.draft.brand.logo, { companyLogo: assets.companyLogo, gameLogo: assets.gameLogo, cpr: session.draft.brand.cpr });
    const tool = isPanPointer(event) ? 'crop' : getFocusHitTarget(point, plan);
    if (tool !== session.tool && !isPanPointer(event)) onSessionChange({ ...session, tool });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, kind: isPanPointer(event) ? 'pan' : tool };
    setDragging(true);
  }

  function updateFocusLogoFromFabric(next: { x: number; y: number; scale: number }, scaledRect: { width: number; height: number }) {
    const position = brandSettings.snapEnabled
      ? snapLogoGroupPosition({ width: spec.width, height: spec.height }, scaledRect, next, brandSettings.snapThreshold / stageScale, constraintMode)
      : next;
    onSessionChange(updateFocusLogo(session, {
      ...session.draft.brand.logo,
      placement: 'custom',
      manualOffset: { x: position.x, y: position.y },
      scale: next.scale
    }));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.x);
    const dy = (event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;

    if (drag.kind === 'pan') {
      setViewport((previous) => clampFocusViewport({ ...previous, panX: previous.panX + dx, panY: previous.panY + dy, mode: 'manual' }, stageBounds, spec));
      return;
    }

    const canvasDx = dx / stageScale;
    const canvasDy = dy / stageScale;

    if (drag.kind === 'crop') {
      const nextCrop = panCropState(asset, spec, session.draft.previewState.crop, canvasDx, canvasDy, session.draft.previewState.fitMode);
      onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, crop: nextCrop } }));
      return;
    }
    if (drag.kind === 'logo') {
      const plan = buildBrandRenderPlan({ width: spec.width, height: spec.height }, session.draft.brand.logo, { companyLogo: assets.companyLogo, gameLogo: assets.gameLogo, cpr: session.draft.brand.cpr });
      const rect = plan.logoGroupRect;
      if (!rect) return;
      const raw = { x: rect.x + canvasDx, y: rect.y + canvasDy };
      const next = brandSettings.snapEnabled ? snapLogoGroupPosition({ width: spec.width, height: spec.height }, rect, raw, brandSettings.snapThreshold / stageScale, constraintMode) : raw;
      onSessionChange(updateFocusLogo(session, { ...session.draft.brand.logo, placement: 'custom', manualOffset: next }));
      return;
    }
    const nextCpr = { ...session.draft.brand.cpr, transform: { ...session.draft.brand.cpr.transform, placement: 'custom' as const, offsetX: session.draft.brand.cpr.transform.offsetX + canvasDx, offsetY: session.draft.brand.cpr.transform.offsetY + canvasDy } };
    onSessionChange(updateFocusCpr(session, nextCpr));
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const factor = wheelSensitivityFactor(brandSettings.focusWheelSensitivity ?? 'standard');
    const delta = -event.deltaY * factor * 0.2;
    const canvasRect = event.currentTarget.getBoundingClientRect();
    const stageRect = stageFrameRef.current?.getBoundingClientRect();
    setViewport((previous) => {
      const nextZoom = clampFocusViewZoom(previous.zoom + delta);
      if (nextZoom === previous.zoom) return previous;
      return clampFocusViewport(
        stageRect
          ? computeZoomViewportFromStage(event.clientX, event.clientY, stageRect, previous, nextZoom)
          : computeZoomViewport(event.clientX, event.clientY, { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height }, previous, nextZoom),
        stageBounds,
        spec
      );
    });
  }

  function fitToWindow() {
    setViewport(createFitViewport(stageBounds, spec));
  }

  function actualSize() {
    setViewport(clampFocusViewport({ zoom: 100, panX: 0, panY: 0, mode: 'manual' }, stageBounds, spec));
  }

  function setCenterZoom(nextZoom: number) {
    setViewport((previous) => clampFocusViewport({ ...previous, zoom: clampFocusViewZoom(nextZoom), mode: 'manual' }, stageBounds, spec));
  }

  function locateLogo() {
    const rect = selectionPlan.logoGroupRect;
    if (!rect) return;
    const fitZoom = getFocusFitZoom(stageBounds, spec);
    const targetZoom = Math.min(300, Math.max(fitZoom, Math.min(
      (stageBounds.width * .6 / rect.width) * 100,
      (stageBounds.height * .45 / rect.height) * 100
    )));
    setViewport(centerViewportOnCanvasPoint(stageBounds, spec, targetZoom, {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2
    }));
  }

  return <section className="focus-workspace" aria-label="画板聚焦工作区">
   <div className="focus-workspace-header">
     <div><span className="dialog-kicker">画板调整</span><h2>{spec.name}</h2><small>{spec.width} x {spec.height}</small></div>
     <div className="dialog-actions"><button type="button" onClick={() => session.dirty ? setConfirmDiscard(true) : onCancel()}>取消</button><button type="button" className="primary-button" onClick={() => onCommit(session)}>保存并返回</button></div>
   </div>
    <div className="focus-hint-bar" aria-label="聚焦操作提示" title={TOOL_HINT_DETAILS[session.tool]}>
      <svg className="focus-hint-icon" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M3 4h7a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H7l-3 2.5V11H4a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 4 3.5z"/></svg>
      <span className="focus-hint-text">{TOOL_HINTS[session.tool]}</span>
    </div>
   <div className="focus-workspace-body">
      <aside className="focus-brand-controls">{brandControls}</aside>
      <div ref={stageFrameRef} className={`focus-stage-frame is-editing-${session.tool} ${dragging ? 'is-dragging' : ''} ${spacePressed ? 'is-panning' : ''}`}>
        <div className="focus-canvas-wrapper" style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px)` }}>
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
          onWheel={onWheel}
        />
        {session.tool === 'logo' && selectionPlan.logoGroupRect && !focusLogoFabricFailed ? <FocusLogoFabricOverlay
          canvas={{ width: spec.width, height: spec.height }}
          rect={selectionPlan.logoGroupRect}
          previewScale={stageScale}
          currentScale={session.draft.brand.logo.scale ?? 1}
          constraintMode={constraintMode}
          selected
          onSelectedChange={(selected) => {
            if (!selected) onSessionChange({ ...session, tool: 'crop' });
          }}
          onTransformChange={updateFocusLogoFromFabric}
          onTransformingChange={setDragging}
          onError={() => setFocusLogoFabricFailed(true)}
        /> : null}
        {selectionRect && (session.tool !== 'logo' || focusLogoFabricFailed) ? <div className="focus-selection-outline" aria-live="polite" style={{ left: selectionRect.x * stageScale, top: selectionRect.y * stageScale, width: selectionRect.width * stageScale, height: selectionRect.height * stageScale }}><span>{dragging ? `正在拖动${selectionLabel}` : selectionLabel}</span></div> : session.tool !== 'logo' ? <div className="focus-selection-hint">图片裁切</div> : null}
        </div>
      </div>
      <aside className="focus-side-controls">
        <div className="focus-view-zoom" aria-label="查看倍率">
          <span className="control-label">查看倍率</span>
          <div className="focus-view-zoom-controls">
            <button type="button" aria-label="缩小查看倍率" title="缩小查看倍率" onClick={() => setCenterZoom(viewport.zoom - VIEW_ZOOM_STEP)} disabled={viewport.zoom <= MIN_VIEW_ZOOM}>−</button>
            <output aria-live="polite">{Math.round(viewport.zoom)}%</output>
            <button type="button" aria-label="放大查看倍率" title="放大查看倍率" onClick={() => setCenterZoom(viewport.zoom + VIEW_ZOOM_STEP)} disabled={viewport.zoom >= MAX_VIEW_ZOOM}>+</button>
          </div>
          <input aria-label="查看倍率滑块" type="range" min={MIN_VIEW_ZOOM} max={MAX_VIEW_ZOOM} step="1" value={Math.max(MIN_VIEW_ZOOM, viewport.zoom)} onChange={(event) => setCenterZoom(Number(event.target.value))} />
          <div className="focus-view-commands" aria-label="查看视口命令">
            <button type="button" className="focus-view-command" aria-label="适合窗口" onClick={fitToWindow} title="完整画板居中显示，并清除查看平移">适合</button>
            <button type="button" className="focus-view-command" aria-label="实际尺寸 100%" onClick={actualSize} title="按画板像素 1:1 显示">100%</button>
            {selectionPlan.logoGroupRect ? <button type="button" className="focus-view-command" aria-label="定位 Logo" onClick={locateLogo} title="只调整查看视口，不修改 Logo 坐标">定位</button> : null}
          </div>
          <small className="inline-note" title="查看倍率和视口平移不会修改裁切、Logo/CPR 位置或正式导出。">仅改变查看视口</small>
        </div>
        {session.tool === 'crop' ? <><div><span className="control-label">填充方式</span><div className="segmented-control"><button type="button" className={session.draft.previewState.fitMode === 'cover' ? 'active' : ''} onClick={() => onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, fitMode: 'cover' } }))}>填满画布</button><button type="button" className={session.draft.previewState.fitMode === 'contain' ? 'active' : ''} onClick={() => onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, fitMode: 'contain' } }))}>适应画布</button></div></div><label className="focus-range-field"><span className="control-label">素材缩放</span><input type="range" min={minScale} max={maxScale} step={Math.max(minScale / 100, .001)} value={crop.scale} onChange={(event) => updateCrop(Number(event.target.value))} /></label><button type="button" onClick={() => onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, crop: createInitialCropState(asset, spec, session.draft.previewState.fitMode) } }))}>裁切复位</button>{onApplyCropSameSize ? <button type="button" onClick={onApplyCropSameSize}>同素材·同尺寸同步裁切</button> : null}</> : null}
        {session.tool === 'logo' && bounds ? (
          <div className="focus-bounds-info">
            <span className="control-label">位置边界</span>
            <small>{constraintMode === 'safe-area' ? '安全区内' : '画布内'} · 方向键 1px，Shift+方向键 10px</small>
          </div>
        ) : null}
        <p className="dialog-help" title="聚焦期间所有修改先保存在草稿中，点击“保存并返回”后才写入画板。">修改先保存在草稿中</p>
      </aside>
    </div>
    {pendingModuleChange ? <div className="focus-discard-confirm" role="alert"><span>当前调整尚未保存。保存后切换到{pendingModuleChange}吗？</span><button type="button" onClick={onCancelModuleChange}>取消</button><button type="button" className="danger-button" onClick={onDiscardAndLeave}>放弃</button><button type="button" className="primary-button" onClick={onSaveAndLeave}>保存</button></div> : confirmDiscard ? <div className="focus-discard-confirm" role="alert"><span>当前调整尚未保存，确定放弃吗？</span><button type="button" onClick={() => setConfirmDiscard(false)}>继续调整</button><button type="button" className="danger-button" onClick={onCancel}>放弃修改</button></div> : null}
  </section>;
}
