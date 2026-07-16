import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  buildBrandRenderPlan,
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
  onCommit
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
}) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; kind: FocusSession['tool']; originX?: number; originY?: number }>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const assets = resolveBoardBrandAssets({ boardBrandState: session.draft.brand, brandCatalog, brandLayer });
  const stageScale = Math.min(820 / spec.width, 560 / spec.height, 1.6);
  const crop = session.draft.previewState.crop;
  const minScale = computeFitScale(asset, spec, session.draft.previewState.fitMode);
  const maxScale = minScale * 6;

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
  }, [onCancel]);

  function updateCrop(scale: number) {
    const nextCrop = zoomCropState(asset, spec, crop, scale, { x: spec.width / 2, y: spec.height / 2 }, session.draft.previewState.fitMode);
    onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, crop: clampCropState(asset, spec, nextCrop, session.draft.previewState.fitMode) } }));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, kind: session.tool };
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
      <div className="focus-stage-frame">
        <BoardCanvas
          asset={asset}
          spec={spec}
          previewState={session.draft.previewState}
          logoAsset={assets.gameLogo}
          cprAsset={assets.cpr}
          brandLayer={{ ...brandLayer, logoGroup: session.draft.brand.logo, cprState: session.draft.brand.cpr, cprEnabled: session.draft.brand.cpr.enabled }}
          brandSettings={brandSettings}
          overlayCompanyLogo={assets.companyLogo}
          overlayGameLogo={assets.gameLogo}
          scale={stageScale}
          draggable
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { dragRef.current = undefined; }}
        />
      </div>
      <aside className="focus-side-controls">
        <div><span className="control-label">调整对象</span><div className="segmented-control"><button type="button" className={session.tool === 'crop' ? 'active' : ''} onClick={() => onSessionChange({ ...session, tool: 'crop' })}>图片裁切</button><button type="button" className={session.tool === 'logo' ? 'active' : ''} onClick={() => onSessionChange({ ...session, tool: 'logo' })}>品牌位置</button><button type="button" className={session.tool === 'cpr' ? 'active' : ''} onClick={() => onSessionChange({ ...session, tool: 'cpr' })}>CPR 位置</button></div></div>
        <div><span className="control-label">填充方式</span><div className="segmented-control"><button type="button" className={session.draft.previewState.fitMode === 'cover' ? 'active' : ''} onClick={() => onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, fitMode: 'cover' } }))}>填满画布</button><button type="button" className={session.draft.previewState.fitMode === 'contain' ? 'active' : ''} onClick={() => onSessionChange(withFocusDraft(session, { ...session.draft, previewState: { ...session.draft.previewState, fitMode: 'contain' } }))}>适应画布</button></div></div>
        <label className="focus-range-field"><span className="control-label">缩放</span><input type="range" min={minScale} max={maxScale} step={Math.max(minScale / 100, .001)} value={crop.scale} onChange={(event) => updateCrop(Number(event.target.value))} /></label>
        {session.tool === 'logo' ? <label className="focus-range-field"><span className="control-label">Logo 大小 {Math.round((session.draft.brand.logo.scale ?? 1) * 100)}%</span><input type="range" min="0.5" max="2" step="0.01" value={session.draft.brand.logo.scale ?? 1} onChange={(event) => onSessionChange(updateFocusLogo(session, { ...session.draft.brand.logo, scale: Number(event.target.value) }))} /></label> : null}
        <p className="dialog-help">聚焦期间所有修改均保存在草稿中；保存前不会写入画板。</p>
      </aside>
    </div>
    {confirmDiscard ? <div className="focus-discard-confirm" role="alert"><span>当前调整尚未保存，确定放弃吗？</span><button type="button" onClick={() => setConfirmDiscard(false)}>继续调整</button><button type="button" className="danger-button" onClick={onCancel}>放弃修改</button></div> : null}
  </section>;
}
