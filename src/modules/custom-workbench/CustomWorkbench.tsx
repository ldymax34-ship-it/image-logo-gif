import { useEffect, useRef, useState } from 'react';
import { BrandEffectControls } from '../../components/brand/BrandEffectControls';
import { buildBoardRenderPlan, canvasToBlob, computeCprPlacementRect, createInitialCropState, createMaterialAsset, deriveBrandColorMode, drawBrandLayersToCanvas, exportBoardImageWithinLimit, exportJpegWithinLimit, renderBoardToCanvas, snapLogoGroupPosition, type BrandAsset, type BrandEffectState, type BrandLanguage, type BrandLayerState, type BoardPreviewState, type MaterialAsset, type MaterialFormat, type MaterialSpec, getBrandLanguageLabel } from '../../core';
import { chooseOutputTarget, saveBlobToOutputTarget } from '../../platform/fileSystem';
import { BoardCanvas } from '../../components/canvas';
import { CustomFabricOverlay, type CustomFabricObjectId } from './CustomFabricOverlay';
import { resolveCustomFabricItems, type CustomFabricOverlayItem } from './customFabricItems';
import { constrainCustomTransform, getCustomTransformBounds, type CustomObjectTransform } from './customFabricCoords';
import { toCustomFabricTransformPatch } from './customFabricState';

const CUSTOM_SPEC: MaterialSpec = { id: 'custom-canvas', name: '自定义画板', width: 1920, height: 1080, format: 'png' };
export const CUSTOM_LOGO_MAX_SCALE = 3;
export type CustomWorkbenchDirtySnapshot = { gameEnabled: boolean; companyEnabled: boolean; gameScale: number; companyScale: number; cprScale: number; gameOffset: { x: number; y: number }; companyOffset: { x: number; y: number }; cprOffset: { x: number; y: number }; cprEnabled: boolean; gameEffect: BrandEffectState; companyEffect: BrandEffectState; cprEffect: BrandEffectState; format: MaterialFormat; gameLanguage: BrandLanguage; guidesVisible: boolean; snapEnabled: boolean };
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
  const [status, setStatus] = useState('');
  const [gameLanguage, setGameLanguage] = useState<BrandLanguage>(gameLogo?.language ?? 'zh-CN');
  const [guidesVisible, setGuidesVisible] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedObjectId, setSelectedObjectId] = useState<CustomFabricObjectId>();
  const initialDirtySnapshot = useRef<CustomWorkbenchDirtySnapshot>({ gameEnabled: true, companyEnabled: false, gameScale: 1, companyScale: 1, cprScale: 1, gameOffset: { x: 460, y: 216 }, companyOffset: { x: 1036, y: 216 }, cprOffset: { x: 0, y: 0 }, cprEnabled: true, gameEffect: brandLayer.logoEffect, companyEffect: brandLayer.logoEffect, cprEffect: brandLayer.cprEffect, format: 'png', gameLanguage: gameLogo?.language ?? 'zh-CN', guidesVisible: true, snapEnabled: true });

  useEffect(() => {
    const dirty = isCustomWorkbenchDirty(asset, initialDirtySnapshot.current, { gameEnabled, companyEnabled, gameScale, companyScale, cprScale, gameOffset, companyOffset, cprOffset, cprEnabled, gameEffect, companyEffect, cprEffect, format, gameLanguage, guidesVisible, snapEnabled });
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [asset, companyEffect, companyEnabled, companyOffset, companyScale, cprEffect, cprEnabled, cprOffset, cprScale, format, gameEffect, gameEnabled, gameLanguage, gameOffset, gameScale, guidesVisible, onDirtyChange, snapEnabled]);

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

  function numberControl(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void) {
    const displayValue = Number(value.toFixed(step < 1 ? 2 : 1));
    return <label className="range-field custom-number-field"><span>{label}</span><input aria-label={`${label}数值`} type="number" min={min} max={max} step={step} value={displayValue} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} /></label>;
  }

  async function importAsset(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    try {
      const next = await createMaterialAsset(file);
      if (asset) URL.revokeObjectURL(asset.objectUrl);
      setAsset(next);
      setPreviewState({ assetId: next.id, specId: CUSTOM_SPEC.id, fitMode: 'contain', crop: createInitialCropState(next, CUSTOM_SPEC, 'contain') });
      setStatus(`已导入 ${next.fileName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  useEffect(() => () => { if (asset) URL.revokeObjectURL(asset.objectUrl); }, [asset]);

  async function exportCurrent() {
    if (!asset || !previewState) return;
    const target = await chooseOutputTarget();
    if (target.kind === 'cancelled') return;
    try {
      const result = await exportBoardImageWithinLimit({
        asset,
        spec: { ...CUSTOM_SPEC, format },
        previewState,
        brandLayer: { ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: customCprState, logoGroup: gameGroup },
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
        const canvas = await renderBoardToCanvas({ asset, spec: { ...CUSTOM_SPEC, format }, previewState, brandLayer: { ...brandLayer, logoEnabled: false, cprEnabled: false, logoGroup: gameGroup }, format });
        const gamePlan = buildBoardRenderPlan({ asset, spec: { ...CUSTOM_SPEC, format }, previewState, brandLayer: { ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: customCprState, logoGroup: gameGroup }, cprAsset, gameLogoAsset: selectedGameLogo });
        const companyPlan = buildBoardRenderPlan({ asset, spec: { ...CUSTOM_SPEC, format }, previewState, brandLayer: { ...brandLayer, logoEnabled: true, cprEnabled: false, logoEffect: companyEffect, logoGroup: companyGroup }, companyLogoAsset: companyLogo });
        await drawBrandLayersToCanvas(canvas, [...gamePlan.layers, ...companyPlan.layers]);
        const maxBytes = 8 * 1024 * 1024;
        if (format === 'png') {
          const blob = await canvasToBlob(canvas, 'png');
          if (blob.size > maxBytes) throw new Error('当前 PNG 超过 8MB 限制，请改用 JPG 或缩小画板');
          result.blob = blob;
        } else {
          const compressed = await exportJpegWithinLimit({
            encode: (quality) => canvasToBlob(canvas, 'jpg', quality),
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
  const previewScale = Math.min(760 / CUSTOM_SPEC.width, 520 / CUSTOM_SPEC.height);
  const interactionGamePlan = hasImage ? buildBoardRenderPlan({ asset: asset!, spec: CUSTOM_SPEC, previewState: previewState!, brandLayer: { ...brandLayer, logoEnabled: true, cprEnabled: true, logoEffect: gameEffect, cprEffect, cprState: { ...customCprState, enabled: true }, logoGroup: gameGroup }, cprAsset, gameLogoAsset: selectedGameLogo }) : undefined;
  const companyPlan = hasImage && companyLogo ? buildBoardRenderPlan({ asset: asset!, spec: CUSTOM_SPEC, previewState: previewState!, brandLayer: { ...brandLayer, logoEnabled: true, cprEnabled: false, logoEffect: companyEffect, logoGroup: companyGroup }, companyLogoAsset: companyLogo }) : undefined;
  const cprRect = interactionGamePlan?.layers.find((item) => item.type === 'cpr')?.rect;
  const interactionItems = resolveCustomFabricItems({
    gamePlan: interactionGamePlan,
    companyPlan,
    gameEnabled,
    companyEnabled,
    cprEnabled,
    gameScale,
    companyScale,
    cprScale,
    logoMaxScale: CUSTOM_LOGO_MAX_SCALE
  });
  const selectedInteractionItem = selectedObjectId ? interactionItems.find((item) => item.id === selectedObjectId) : undefined;
  const selectedTransformBounds = selectedInteractionItem
    ? getCustomTransformBounds(selectedInteractionItem.rect, selectedInteractionItem.currentScale, CUSTOM_SPEC, selectedInteractionItem.currentScale)
    : undefined;

  function constrainInteractionTransform(item: CustomFabricOverlayItem, requested: CustomObjectTransform): CustomObjectTransform {
    return constrainCustomTransform(requested, item.rect, item.currentScale, CUSTOM_SPEC, item.minScale, item.maxScale);
  }

  function applyFabricTransform(id: CustomFabricObjectId, requested: CustomObjectTransform, sourceItem?: CustomFabricOverlayItem) {
    const item = sourceItem ?? interactionItems.find((candidate) => candidate.id === id);
    if (!item) return;
    const transform = constrainInteractionTransform(item, requested);
    const defaultRect = computeCprPlacementRect(CUSTOM_SPEC, { placement: 'bottom-right', offsetX: 0, offsetY: 0 }, transform.scale, 'canvas');
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
      CUSTOM_SPEC,
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
      const defaultRect = computeCprPlacementRect(CUSTOM_SPEC, { placement: 'bottom-right', offsetX: 0, offsetY: 0 }, 1, 'canvas');
      editSelectedTransform({ x: defaultRect.x, y: defaultRect.y, scale: 1 });
    }
  }

  return <section className="custom-workspace" aria-label="自定义工作区">
    <aside className="custom-controls">
      <div className="custom-section-title">自定义构图</div>
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
              <div><h3><span className="section-state-dot" aria-hidden="true" />固定对象</h3><small>点击画布对象或在此选择</small></div>
            </div>
            <div className="custom-object-selector" role="group" aria-label="选择固定对象">
              <button type="button" className={selectedObjectId === 'game' ? 'active' : ''} onClick={() => setSelectedObjectId('game')}>游戏 Logo</button>
              <button type="button" className={selectedObjectId === 'company' ? 'active' : ''} onClick={() => setSelectedObjectId('company')}>公司 Logo</button>
              <button type="button" className={selectedObjectId === 'cpr' ? 'active' : ''} onClick={() => setSelectedObjectId('cpr')}>CPR</button>
            </div>
          </div>

          <div className="brand-control-group">
            <div className="section-header is-idle" data-section-state="idle">
              <div><h3><span className="section-state-dot" aria-hidden="true" />{selectedObjectId === 'game' ? '游戏 Logo' : selectedObjectId === 'company' ? '公司 Logo' : selectedObjectId === 'cpr' ? 'CPR' : '当前对象'}</h3><small>{selectedObjectId ? '拖动与四角等比缩放；数值用于精调' : '请点击画布中的 Logo 或 CPR'}</small></div>
            </div>
            {selectedObjectId === 'game' ? <>
              <label className="toggle"><input type="checkbox" checked={gameEnabled} onChange={(event) => setGameEnabled(event.target.checked)} />显示游戏 Logo</label>
              <label className="control-row"><span>语种</span><select value={gameLanguage} onChange={(event) => setGameLanguage(event.target.value as BrandLanguage)}>{gameLogos.map((item) => <option key={item.id} value={item.language}>{getBrandLanguageLabel(item.language)}</option>)}</select></label>
              {numberControl('缩放', selectedInteractionItem?.currentScale ?? gameScale, .6, CUSTOM_LOGO_MAX_SCALE, .01, (scale) => editSelectedTransform({ scale }))}
              {numberControl('X', selectedInteractionItem?.rect.x ?? 0, 0, selectedTransformBounds?.maxX ?? 0, 1, (x) => editSelectedTransform({ x }))}
              {numberControl('Y', selectedInteractionItem?.rect.y ?? 0, 0, selectedTransformBounds?.maxY ?? 0, 1, (y) => editSelectedTransform({ y }))}
              <small className="inline-note">{fmtScale(selectedInteractionItem?.currentScale ?? gameScale)} · ({fmtCoord(selectedInteractionItem?.rect.x ?? 0)}, {fmtCoord(selectedInteractionItem?.rect.y ?? 0)})</small>
              <button type="button" onClick={resetSelectedObject}>复位</button>
              <details className="effect-details"><summary>高级样式 <span className="effect-summary">{effectSummary(gameEffect)}</span></summary><BrandEffectControls title="游戏 Logo" effect={gameEffect} onChange={setGameEffect} /></details>
            </> : null}
            {selectedObjectId === 'company' ? <>
              <label className="toggle"><input type="checkbox" checked={companyEnabled} onChange={(event) => setCompanyEnabled(event.target.checked)} />显示公司 Logo</label>
              {numberControl('缩放', selectedInteractionItem?.currentScale ?? companyScale, .6, CUSTOM_LOGO_MAX_SCALE, .01, (scale) => editSelectedTransform({ scale }))}
              {numberControl('X', selectedInteractionItem?.rect.x ?? 0, 0, selectedTransformBounds?.maxX ?? 0, 1, (x) => editSelectedTransform({ x }))}
              {numberControl('Y', selectedInteractionItem?.rect.y ?? 0, 0, selectedTransformBounds?.maxY ?? 0, 1, (y) => editSelectedTransform({ y }))}
              <small className="inline-note">{fmtScale(selectedInteractionItem?.currentScale ?? companyScale)} · ({fmtCoord(selectedInteractionItem?.rect.x ?? 0)}, {fmtCoord(selectedInteractionItem?.rect.y ?? 0)})</small>
              <button type="button" onClick={resetSelectedObject}>复位</button>
              <details className="effect-details"><summary>高级样式 <span className="effect-summary">{effectSummary(companyEffect)}</span></summary><BrandEffectControls title="公司 Logo" effect={companyEffect} onChange={setCompanyEffect} /></details>
            </> : null}
            {selectedObjectId === 'cpr' ? <>
              <label className="toggle"><input type="checkbox" checked={cprEnabled} onChange={(event) => setCprEnabled(event.target.checked)} />显示 CPR</label>
              {numberControl('缩放', selectedInteractionItem?.currentScale ?? cprScale, .5, 2, .01, (scale) => editSelectedTransform({ scale }))}
              {numberControl('X', selectedInteractionItem?.rect.x ?? cprRect?.x ?? 0, 0, selectedTransformBounds?.maxX ?? 0, 1, (x) => editSelectedTransform({ x }))}
              {numberControl('Y', selectedInteractionItem?.rect.y ?? cprRect?.y ?? 0, 0, selectedTransformBounds?.maxY ?? 0, 1, (y) => editSelectedTransform({ y }))}
              <small className="inline-note">{fmtScale(selectedInteractionItem?.currentScale ?? cprScale)} · ({fmtCoord(selectedInteractionItem?.rect.x ?? cprRect?.x ?? 0)}, {fmtCoord(selectedInteractionItem?.rect.y ?? cprRect?.y ?? 0)})</small>
              <button type="button" onClick={resetSelectedObject}>复位</button>
              <details className="effect-details"><summary>高级样式 <span className="effect-summary">{effectSummary(cprEffect)}</span></summary><BrandEffectControls title="CPR" effect={cprEffect} onChange={setCprEffect} /></details>
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

          {/* ── Export ── */}
          <div className="brand-control-group">
            <div className="section-header is-idle" data-section-state="idle">
              <div><h3><span className="section-state-dot" aria-hidden="true" />导出</h3><small>格式与输出</small></div>
            </div>
            <div className="segmented-control"><button type="button" className={format === 'png' ? 'active' : ''} onClick={() => setFormat('png')}>PNG</button><button type="button" className={format === 'jpg' ? 'active' : ''} onClick={() => setFormat('jpg')}>JPG</button></div>
            <button type="button" onClick={() => void exportCurrent()} disabled={!asset}>导出当前画板</button>
            {status ? <small role="status">{status}</small> : null}
          </div>
        </>
      )}
    </aside>
    <div className="custom-stage">
      {asset && previewState ? <div className="custom-canvas-stack">
        {guidesVisible ? <div className="custom-guides"><span /><span /></div> : null}
        <BoardCanvas
          asset={asset}
          spec={CUSTOM_SPEC}
          previewState={previewState}
          logoAsset={logoAsset}
          cprAsset={cprAsset}
          brandLayer={{ ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: customCprState, logoGroup: gameGroup }}
          scale={previewScale}
          overlayGameLogo={gameEnabled ? selectedGameLogo : undefined}
        />
        {companyEnabled ? <BoardCanvas
          asset={asset}
          spec={CUSTOM_SPEC}
          previewState={previewState}
          logoAsset={logoAsset}
          cprAsset={undefined}
          brandLayer={{ ...brandLayer, logoEnabled: true, cprEnabled: false, logoEffect: companyEffect, logoGroup: companyGroup }}
          scale={previewScale}
          showImage={false}
          transparent
          overlayCompanyLogo={companyLogo}
        /> : null}
        <CustomFabricOverlay
          canvas={CUSTOM_SPEC}
          previewScale={previewScale}
          items={interactionItems}
          selectedId={selectedObjectId}
          onSelectedIdChange={setSelectedObjectId}
          onTransformChange={applyFabricTransform}
          onSnapTransform={snapFabricTransform}
          onError={setStatus}
        />
      </div> : <div className="custom-empty"><strong>导入一张图片开始自定义构图</strong></div>}
    </div>
  </section>;
}
