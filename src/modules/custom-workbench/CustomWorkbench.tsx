import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { BrandEffectControls } from '../../components/brand/BrandEffectControls';
import { buildBoardRenderPlan, canvasToBlob, createInitialCropState, createMaterialAsset, drawBrandLayersToCanvas, exportBoardImageWithinLimit, exportJpegWithinLimit, renderBoardToCanvas, snapLogoGroupPosition, type BrandAsset, type BrandEffectState, type BrandLanguage, type BrandLayerState, type BoardPreviewState, type MaterialAsset, type MaterialFormat, type MaterialSpec } from '../../core';
import { chooseOutputTarget, saveBlobToOutputTarget } from '../../platform/fileSystem';
import { BoardCanvas } from '../../components/canvas';

const CUSTOM_SPEC: MaterialSpec = { id: 'custom-canvas', name: '自定义画板', width: 1920, height: 1080, format: 'png' };

export function CustomWorkbench({ brandLayer, logoAsset, cprAsset, companyLogo, gameLogo, gameLogos }: {
  brandLayer: BrandLayerState;
  logoAsset?: BrandAsset;
  cprAsset?: BrandAsset;
  companyLogo?: BrandAsset;
  gameLogo?: BrandAsset;
  gameLogos: BrandAsset[];
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [asset, setAsset] = useState<MaterialAsset>();
  const [previewState, setPreviewState] = useState<BoardPreviewState>();
  const [gameEnabled, setGameEnabled] = useState(true);
  const [companyEnabled, setCompanyEnabled] = useState(false);
  const [gameScale, setGameScale] = useState(1);
  const [companyScale, setCompanyScale] = useState(1);
  const [gameOffset, setGameOffset] = useState({ x: CUSTOM_SPEC.width * .24, y: CUSTOM_SPEC.height * .2 });
  const [companyOffset, setCompanyOffset] = useState({ x: CUSTOM_SPEC.width * .54, y: CUSTOM_SPEC.height * .2 });
  const [cprEnabled, setCprEnabled] = useState(true);
  const [gameEffect, setGameEffect] = useState<BrandEffectState>(brandLayer.logoEffect);
  const [companyEffect, setCompanyEffect] = useState<BrandEffectState>(brandLayer.logoEffect);
  const [cprEffect, setCprEffect] = useState<BrandEffectState>(brandLayer.cprEffect);
  const [format, setFormat] = useState<MaterialFormat>('png');
  const [status, setStatus] = useState('导入图片后可自由摆放品牌元素。');
  const [gameLanguage, setGameLanguage] = useState<BrandLanguage>(gameLogo?.language ?? 'zh-CN');
  const [guidesVisible, setGuidesVisible] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const dragRef = useRef<{ target: 'game' | 'company'; pointerId: number; startX: number; startY: number; origin: { x: number; y: number } }>();

  const group = brandLayer.logoGroup ?? { mode: 'game-only' as const, gameLogoLanguage: brandLayer.logoLanguage, colorMode: 'white' as const, sizePreset: 'xl' as const, companyLogoScale: 'match' as const, gapUnits: .5, placement: 'center' as const, lastExplicitPlacement: 'center' as const };
  const gameGroup = {
    ...group,
    mode: 'game-only' as const,
    sizePreset: 'standard' as const,
    scale: gameScale,
    manualOffset: gameOffset,
    placement: 'custom' as const,
    gameLogoScale: 1,
    companyLogoScale: 'match' as const
  };
  const companyGroup = {
    ...group,
    mode: 'company-only' as const,
    sizePreset: 'standard' as const,
    scale: companyScale,
    manualOffset: companyOffset,
    placement: 'custom' as const,
    companyLogoScale: 'match' as const,
    companyLogoScaleFactor: 1
  };
  const selectedGameLogo = gameLogos.find((item) => item.language === gameLanguage) ?? gameLogo;

  function beginDrag(target: 'game' | 'company', event: PointerEvent<HTMLDivElement>) {
    const origin = target === 'game' ? gameOffset : companyOffset;
    dragRef.current = { target, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = { x: drag.origin.x + (event.clientX - drag.startX) / previewScale, y: drag.origin.y + (event.clientY - drag.startY) / previewScale };
    const activeGroup = drag.target === 'game' ? gameGroup : companyGroup;
    const plan = buildBoardRenderPlan({ asset: asset!, spec: CUSTOM_SPEC, previewState: previewState!, brandLayer: { ...brandLayer, logoGroup: activeGroup }, companyLogoAsset: companyLogo, gameLogoAsset: selectedGameLogo });
    const rect = plan.layers.find((item) => item.type === 'logo')?.rect ?? { width: 240, height: 80 };
    const snapped = snapEnabled ? snapLogoGroupPosition(CUSTOM_SPEC, rect, next, 12 / previewScale) : next;
    if (drag.target === 'game') setGameOffset({ x: snapped.x, y: snapped.y });
    else setCompanyOffset({ x: snapped.x, y: snapped.y });
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
  }

  function numberControl(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void) {
    const displayValue = Number(value.toFixed(step < 1 ? 2 : 1));
    return <label className="range-field custom-number-field"><span>{label}</span><div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><input aria-label={`${label}数值`} type="number" min={min} max={max} step={step} value={displayValue} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} /></div></label>;
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
        brandLayer: { ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: { ...(brandLayer.cprState ?? { enabled: cprEnabled, transform: { placement: 'bottom-right' as const, offsetX: 0, offsetY: 0 }, colorMode: 'white' as const, effect: cprEffect }), enabled: cprEnabled, effect: cprEffect }, logoGroup: gameGroup },
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
        const gamePlan = buildBoardRenderPlan({ asset, spec: { ...CUSTOM_SPEC, format }, previewState, brandLayer: { ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: { ...(brandLayer.cprState ?? { enabled: cprEnabled, transform: { placement: 'bottom-right' as const, offsetX: 0, offsetY: 0 }, colorMode: 'white' as const, effect: cprEffect }), enabled: cprEnabled, effect: cprEffect }, logoGroup: gameGroup }, cprAsset, gameLogoAsset: selectedGameLogo });
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

  const previewScale = Math.min(760 / CUSTOM_SPEC.width, 520 / CUSTOM_SPEC.height);
  return <section className="custom-workspace" aria-label="自定义工作区">
    <aside className="custom-controls">
      <div className="section-title"><span />自定义构图</div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void importAsset(event.target.files)} />
      <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>导入图片</button>
      <label className="toggle"><input type="checkbox" checked={gameEnabled} onChange={(event) => setGameEnabled(event.target.checked)} />游戏 Logo</label>
      <label className="control-row"><span>游戏语种</span><select value={gameLanguage} onChange={(event) => setGameLanguage(event.target.value as BrandLanguage)}>{gameLogos.map((item) => <option key={item.id} value={item.language}>{item.language}</option>)}</select></label>
      {numberControl('游戏大小', gameScale, .6, 1.7, .01, setGameScale)}
      {numberControl('游戏横移', gameOffset.x, 0, 1500, 1, (x) => setGameOffset((previous) => ({ ...previous, x })))}
      {numberControl('游戏纵移', gameOffset.y, 0, 900, 1, (y) => setGameOffset((previous) => ({ ...previous, y })))}
      <BrandEffectControls title="游戏 Logo" effect={gameEffect} onChange={setGameEffect} />
      <label className="toggle"><input type="checkbox" checked={companyEnabled} onChange={(event) => setCompanyEnabled(event.target.checked)} />公司 Logo</label>
      {numberControl('公司大小', companyScale, .6, 1.7, .01, setCompanyScale)}
      {numberControl('公司横移', companyOffset.x, 0, 1500, 1, (x) => setCompanyOffset((previous) => ({ ...previous, x })))}
      {numberControl('公司纵移', companyOffset.y, 0, 900, 1, (y) => setCompanyOffset((previous) => ({ ...previous, y })))}
      <BrandEffectControls title="公司 Logo" effect={companyEffect} onChange={setCompanyEffect} />
      <label className="toggle"><input type="checkbox" checked={cprEnabled} onChange={(event) => setCprEnabled(event.target.checked)} />CPR</label>
      <BrandEffectControls title="CPR" effect={cprEffect} onChange={setCprEffect} />
      <label className="toggle"><input type="checkbox" checked={guidesVisible} onChange={(event) => setGuidesVisible(event.target.checked)} />参考线</label>
      <label className="toggle"><input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} />网格吸附</label>
      <div className="segmented-control"><button type="button" className={format === 'png' ? 'active' : ''} onClick={() => setFormat('png')}>PNG</button><button type="button" className={format === 'jpg' ? 'active' : ''} onClick={() => setFormat('jpg')}>JPG</button></div>
      <button type="button" onClick={() => void exportCurrent()} disabled={!asset}>导出当前画板</button>
      <small>{status}</small>
    </aside>
    <div className="custom-stage">{asset && previewState ? <div className="custom-canvas-stack">{guidesVisible ? <div className="custom-guides"><span /><span /></div> : null}<BoardCanvas asset={asset} spec={CUSTOM_SPEC} previewState={previewState} logoAsset={logoAsset} cprAsset={cprAsset} brandLayer={{ ...brandLayer, logoEnabled: gameEnabled, cprEnabled, logoEffect: gameEffect, cprEffect, cprState: { ...(brandLayer.cprState ?? { enabled: cprEnabled, transform: { placement: 'bottom-right' as const, offsetX: 0, offsetY: 0 }, colorMode: 'white' as const, effect: cprEffect }), enabled: cprEnabled, effect: cprEffect }, logoGroup: gameGroup }} scale={previewScale} overlayGameLogo={gameEnabled ? selectedGameLogo : undefined} />{gameEnabled ? <div className="custom-drag-layer" style={{ left: gameOffset.x * previewScale, top: gameOffset.y * previewScale }} onPointerDown={(event) => beginDrag('game', event)} onPointerMove={moveDrag} onPointerUp={endDrag} /> : null}{companyEnabled ? <><BoardCanvas asset={asset} spec={CUSTOM_SPEC} previewState={previewState} logoAsset={logoAsset} cprAsset={undefined} brandLayer={{ ...brandLayer, logoEnabled: true, cprEnabled: false, logoEffect: companyEffect, logoGroup: companyGroup }} scale={previewScale} showImage={false} transparent overlayCompanyLogo={companyLogo} /> <div className="custom-drag-layer" style={{ left: companyOffset.x * previewScale, top: companyOffset.y * previewScale }} onPointerDown={(event) => beginDrag('company', event)} onPointerMove={moveDrag} onPointerUp={endDrag} /></> : null}</div> : <div className="empty-state">导入一张图片开始自定义构图</div>}</div>
  </section>;
}
