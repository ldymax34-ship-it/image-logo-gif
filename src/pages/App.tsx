import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BRAND_LANGUAGE_OPTIONS,
  DEFAULT_BRAND_ASSETS,
  DEFAULT_CPR_EFFECT,
  DEFAULT_LOGO_EFFECT,
  buildOutputFileName,
  classifyAspect,
  clampCropState,
  computeCropTransform,
  computeFitScale,
  createBrandAssetFromFile,
  createInitialCropState,
  createMaterialAsset,
  formatFileSize,
  getBrandAssetUrl,
  getBoardPreviewKey,
  getBrandLanguageLabel,
  panCropState,
  parseSpecText,
  renderBrandLayer,
  toBrandSvgAsset,
  zoomCropState,
  type BoardPreviewState,
  type BrandAsset,
  type BrandEffectState,
  type BrandLanguage,
  type BrandLayerState,
  type CropState,
  type FitMode,
  type MaterialAsset,
  type MaterialSpec,
  type WorkbenchState
} from '../core';

const SAMPLE_TEXT = `1080x1920 jpg 1200KB
1920*1080 png 2MB
3840×2160
900 383
1:1 1024
16:9 1920
9:16 1080`;

const DEFAULT_BRAND_LAYER: BrandLayerState = {
  logoEnabled: true,
  cprEnabled: true,
  selectedLogoId: DEFAULT_BRAND_ASSETS[1]?.id,
  logoEffect: DEFAULT_LOGO_EFFECT,
  cprEffect: DEFAULT_CPR_EFFECT
};

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

function buildDropShadowFilter(effect: BrandEffectState, scale = 1): string | undefined {
  const filters: string[] = [];
  if (effect.strokeEnabled && effect.strokeWidth > 0) {
    const width = Math.max(1, effect.strokeWidth * scale);
    const directions = [
      [width, 0],
      [-width, 0],
      [0, width],
      [0, -width],
      [width, width],
      [-width, width],
      [width, -width],
      [-width, -width]
    ];
    for (const [x, y] of directions) {
      filters.push(`drop-shadow(${x}px ${y}px 0 ${effect.strokeColor})`);
    }
  }
  if (effect.glowEnabled && effect.glowBlur > 0) {
    filters.push(`drop-shadow(0 0 ${effect.glowBlur * scale}px ${effect.glowColor})`);
  }
  if (effect.shadowEnabled && effect.shadowBlur > 0) {
    filters.push(
      `drop-shadow(${effect.shadowOffsetX * scale}px ${effect.shadowOffsetY * scale}px ${effect.shadowBlur * scale}px ${hexToRgba(
        effect.shadowColor,
        effect.shadowOpacity
      )})`
    );
  }
  return filters.length ? filters.join(' ') : undefined;
}

function hexToRgba(hex: string, opacity: number): string {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(0,0,0,${opacity})`;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${Math.min(1, Math.max(0, opacity))})`;
}

function SvgImageLayer({
  asset,
  className,
  effect
}: {
  asset: BrandAsset;
  className: string;
  effect: BrandEffectState;
}) {
  const media = useMemo(() => getBrandAssetUrl(asset), [asset]);

  useEffect(() => {
    return () => {
      if (media.revoke) URL.revokeObjectURL(media.url);
    };
  }, [media]);

  if (effect.colorEnabled) {
    return (
      <span
        className={`${className} brand-mask`}
        style={{
          backgroundColor: effect.color,
          WebkitMaskImage: `url("${media.url}")`,
          maskImage: `url("${media.url}")`
        }}
      />
    );
  }

  return <img className={className} src={media.url} alt={asset.name} draggable={false} />;
}

function PreviewStage({
  asset,
  specs,
  selectedSpecId,
  previewStates,
  logoAsset,
  cprAsset,
  brandLayer,
  onSelectSpec,
  onCropChange,
  onFitModeChange
}: {
  asset: MaterialAsset | undefined;
  specs: MaterialSpec[];
  selectedSpecId: string | undefined;
  previewStates: Record<string, BoardPreviewState>;
  logoAsset: BrandAsset | undefined;
  cprAsset: BrandAsset | undefined;
  brandLayer: BrandLayerState;
  onSelectSpec: (specId: string) => void;
  onCropChange: (crop: CropState) => void;
  onFitModeChange: (mode: FitMode) => void;
}) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const selectedSpec = specs.find((spec) => spec.id === selectedSpecId) ?? specs[0];
  const selectedPreviewKey = asset && selectedSpec ? getBoardPreviewKey(asset.id, selectedSpec.id) : undefined;
  const selectedPreviewState = selectedPreviewKey ? previewStates[selectedPreviewKey] : undefined;

  if (!specs.length) {
    return <div className="empty-state">粘贴尺寸后会生成画板；上传图片后可在这里逐尺寸预览。</div>;
  }

  const crop = selectedPreviewState?.crop;
  const coverScale = asset && selectedSpec ? computeFitScale(asset, selectedSpec, 'cover') : 1;
  const containScale = asset && selectedSpec ? computeFitScale(asset, selectedSpec, 'contain') : coverScale;
  const sliderMinScale = selectedPreviewState?.fitMode === 'contain' ? containScale : coverScale;
  const maxScale = Math.max(coverScale, sliderMinScale) * 6;

  function updateCrop(nextCrop: CropState) {
    if (!asset || !selectedSpec || !selectedPreviewState) return;
    onCropChange(clampCropState(asset, selectedSpec, nextCrop, selectedPreviewState.fitMode));
  }

  function resetCrop(mode: FitMode) {
    if (!asset || !selectedSpec) return;
    onFitModeChange(mode);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>, spec: MaterialSpec, stageScale: number, previewState: BoardPreviewState | undefined) {
    onSelectSpec(spec.id);
    if (!asset || spec.id !== selectedSpec?.id || !previewState) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>, spec: MaterialSpec, stageScale: number, previewState: BoardPreviewState | undefined) {
    if (!asset || spec.id !== selectedSpec?.id || !previewState || !dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const deltaX = (event.clientX - dragRef.current.x) / stageScale;
    const deltaY = (event.clientY - dragRef.current.y) / stageScale;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    onCropChange(panCropState(asset, spec, previewState.crop, deltaX, deltaY, previewState.fitMode));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  return (
    <div className="preview-shell">
      <div className="preview-meta">
        <span>总览 {specs.length} 个画板</span>
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
          const transform = asset && previewState ? computeCropTransform(asset, spec, previewState.crop) : undefined;
          const brandPreview = renderBrandLayer({
            canvas: { width: spec.width, height: spec.height },
            includeLogo: brandLayer.logoEnabled && Boolean(logoAsset),
            includeCpr: brandLayer.cprEnabled && Boolean(cprAsset),
            logoAsset: logoAsset ? toBrandSvgAsset(logoAsset) : undefined,
            cprAsset: cprAsset ? toBrandSvgAsset(cprAsset) : undefined,
            logoAnchor: 'top-right',
            cprAnchor: 'center',
            logoSize: 'standard',
            cprSize: 'standard',
            cprColor: brandLayer.cprEffect.color
          });

          return (
            <article key={spec.id} className={`board-card ${isSelected ? 'active' : ''}`}>
              <button
                type="button"
                className="board-card-button"
                onClick={() => onSelectSpec(spec.id)}
                aria-pressed={isSelected}
              >
                <div className="board-card-title">
                  <strong>{spec.name}</strong>
                  <small>{spec.width} x {spec.height}</small>
                </div>
                <div
                  className={`preview-canvas board-canvas ${asset && isSelected ? 'is-draggable' : ''}`}
                  style={{ width: spec.width * scale, height: spec.height * scale }}
                  onPointerDown={(event) => handlePointerDown(event, spec, scale, previewState)}
                  onPointerMove={(event) => handlePointerMove(event, spec, scale, previewState)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  {asset && transform ? (
                    <img
                      className="preview-image"
                      src={asset.objectUrl}
                      alt={asset.fileName}
                      draggable={false}
                      style={{
                        left: transform.offsetX * scale,
                        top: transform.offsetY * scale,
                        width: transform.width * scale,
                        height: transform.height * scale
                      }}
                    />
                  ) : (
                    <div className="canvas-placeholder">上传图片</div>
                  )}
                  <div className="safe-area" />
                  {brandPreview.layers.map((layer) => {
                    const rect = layer.layout.rect;
                    const selectedAsset = layer.type === 'logo' ? logoAsset : cprAsset;
                    if (!selectedAsset) return null;
                    return (
                      <div
                        key={layer.id}
                        className={`brand-layer ${layer.type}`}
                        style={{
                          left: rect.x * scale,
                          top: rect.y * scale,
                          width: rect.width * scale,
                          height: rect.height * scale,
                        zIndex: layer.zIndex,
                          filter: buildDropShadowFilter(layer.type === 'logo' ? brandLayer.logoEffect : brandLayer.cprEffect, scale)
                        }}
                      >
                        <SvgImageLayer
                          asset={selectedAsset}
                          className={`brand-svg ${layer.type}`}
                          effect={layer.type === 'logo' ? brandLayer.logoEffect : brandLayer.cprEffect}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="board-card-footer">
                  <span>{getAspectLabel(spec)}</span>
                  <span>{previewState?.fitMode === 'contain' ? '适应' : '填满'}</span>
                </div>
              </button>
            </article>
          );
        })}
      </div>

      <div className="crop-controls">
        <button type="button" onClick={() => resetCrop('cover')} disabled={!asset}>
          填满画布
        </button>
        <button type="button" onClick={() => resetCrop('contain')} disabled={!asset}>
          适应画布
        </button>
        <button type="button" onClick={() => resetCrop(selectedPreviewState?.fitMode ?? 'cover')} disabled={!asset}>
          重置裁切
        </button>
        <label>
          <span>缩放</span>
          <input
            type="range"
            min={sliderMinScale}
            max={maxScale}
            step={Math.max(sliderMinScale / 100, 0.001)}
            value={crop?.scale ?? sliderMinScale}
            disabled={!asset || !crop}
            onChange={(event) => {
              if (!asset || !selectedSpec || !crop || !selectedPreviewState) return;
              updateCrop(
                zoomCropState(
                  asset,
                  selectedSpec,
                  crop,
                  Number(event.target.value),
                  { x: selectedSpec.width / 2, y: selectedSpec.height / 2 },
                  selectedPreviewState.fitMode
                )
              );
            }}
          />
        </label>
      </div>
    </div>
  );
}

export function App() {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const cprInputRef = useRef<HTMLInputElement | null>(null);
  const assetsRef = useRef<MaterialAsset[]>([]);
  const [text, setText] = useState(SAMPLE_TEXT);
  const [assets, setAssets] = useState<MaterialAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();
  const [selectedSpecId, setSelectedSpecId] = useState<string | undefined>();
  const [previewStates, setPreviewStates] = useState<Record<string, BoardPreviewState>>({});
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>(DEFAULT_BRAND_ASSETS);
  const [brandLayer, setBrandLayer] = useState<BrandLayerState>(DEFAULT_BRAND_LAYER);
  const [logoLanguage, setLogoLanguage] = useState<BrandLanguage>('zh-CN');
  const [cprLanguage, setCprLanguage] = useState<BrandLanguage>('zh-CN');
  const [message, setMessage] = useState<string>('');

  const result = useMemo(() => parseSpecText(text), [text]);
  const specs = result.specs;
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const selectedSpec = specs.find((spec) => spec.id === selectedSpecId) ?? specs[0];
  const previewKey = selectedAsset && selectedSpec ? getBoardPreviewKey(selectedAsset.id, selectedSpec.id) : undefined;
  const previewState = previewKey ? previewStates[previewKey] : undefined;
  const logoAssets = brandAssets.filter((asset) => asset.type === 'logo');
  const cprAssets = brandAssets.filter((asset) => asset.type === 'cpr');
  const selectedLogo = logoAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const selectedCpr = cprAssets.find((asset) => asset.id === brandLayer.selectedCprId);

  const workbenchState: WorkbenchState = {
    assets,
    selectedAssetId: selectedAsset?.id,
    selectedSpecId: selectedSpec?.id,
    previewStates
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
    assetsRef.current = assets;
  }, [assets]);

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

  async function handleBrandFiles(fileList: FileList | null, type: BrandAsset['type'], language: BrandLanguage) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setMessage('正在读取 SVG 资源...');
    try {
      const nextAssets = await Promise.all(files.map((file) => createBrandAssetFromFile(file, type, language)));
      setBrandAssets((previous) => [...previous, ...nextAssets]);
      setBrandLayer((previous) => ({
        ...previous,
        selectedLogoId: type === 'logo' ? previous.selectedLogoId ?? nextAssets[0]?.id : previous.selectedLogoId,
        selectedCprId: type === 'cpr' ? previous.selectedCprId ?? nextAssets[0]?.id : previous.selectedCprId
      }));
      setMessage(`已导入 ${nextAssets.length} 个 ${type === 'logo' ? 'Logo' : 'CPR'} SVG`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SVG 导入失败');
    } finally {
      if (type === 'logo' && logoInputRef.current) logoInputRef.current.value = '';
      if (type === 'cpr' && cprInputRef.current) cprInputRef.current.value = '';
    }
  }

  function updateSelectedPreview(next: Partial<BoardPreviewState>) {
    if (!previewKey || !selectedAsset || !selectedSpec) return;
    setPreviewStates((previous) => {
      const current = previous[previewKey] ?? createPreviewState(selectedAsset, selectedSpec, 'cover');
      return {
        ...previous,
        [previewKey]: { ...current, ...next }
      };
    });
  }

  function resetSelectedCrop(mode: FitMode) {
    if (!selectedAsset || !selectedSpec) return;
    updateSelectedPreview({
      fitMode: mode,
      crop: createInitialCropState(selectedAsset, selectedSpec, mode)
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Brand Material Workbench · 0.1.5</p>
          <h1>品宣物料工作台</h1>
        </div>
        <div className="topbar-status">
          <span>{assets.length} 张素材</span>
          <span>{specs.length} 个画板</span>
          <span>{Object.keys(workbenchState.previewStates).length} 个预览状态</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel asset-panel">
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
              onChange={(event) => void handleBrandFiles(event.target.files, 'logo', logoLanguage)}
            />
            <div className="toolbar-line">
              <select value={logoLanguage} onChange={(event) => setLogoLanguage(event.target.value as BrandLanguage)}>
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
              onSelect={(id) => setBrandLayer((previous) => ({ ...previous, selectedLogoId: id }))}
            />
          </div>

          <div className="brand-section">
            <div className="panel-heading">
              <h2>CPR SVG</h2>
              <button type="button" onClick={() => cprInputRef.current?.click()}>
                导入
              </button>
            </div>
            <input
              ref={cprInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              multiple
              hidden
              onChange={(event) => void handleBrandFiles(event.target.files, 'cpr', cprLanguage)}
            />
            <div className="toolbar-line">
              <select value={cprLanguage} onChange={(event) => setCprLanguage(event.target.value as BrandLanguage)}>
                {BRAND_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={brandLayer.cprEnabled}
                  onChange={(event) => setBrandLayer((previous) => ({ ...previous, cprEnabled: event.target.checked }))}
                />
                启用
              </label>
            </div>
            <BrandAssetList
              assets={cprAssets}
              selectedId={brandLayer.selectedCprId}
              onSelect={(id) => setBrandLayer((previous) => ({ ...previous, selectedCprId: id }))}
            />
          </div>
          <BrandEffectControls
            title="Logo 样式"
            effect={brandLayer.logoEffect}
            onChange={(logoEffect) => setBrandLayer((previous) => ({ ...previous, logoEffect }))}
          />
          <BrandEffectControls
            title="CPR 样式"
            effect={brandLayer.cprEffect}
            onChange={(cprEffect) => setBrandLayer((previous) => ({ ...previous, cprEffect }))}
          />
        </aside>

        <section className="panel preview-panel">
          <div className="panel-heading">
            <h2>预览</h2>
            <span>{previewState?.fitMode === 'contain' ? '适应画布' : '填满画布'}</span>
          </div>
          <PreviewStage
            asset={selectedAsset}
            specs={specs}
            selectedSpecId={selectedSpec?.id}
            previewStates={previewStates}
            logoAsset={selectedLogo}
            cprAsset={selectedCpr}
            brandLayer={brandLayer}
            onSelectSpec={setSelectedSpecId}
            onCropChange={(crop) => updateSelectedPreview({ crop })}
            onFitModeChange={resetSelectedCrop}
          />
          {message && <p className="status-line">{message}</p>}
        </section>

        <aside className="panel spec-panel">
          <div className="panel-heading">
            <h2>尺寸矩阵</h2>
            <span>{specs.length} 个画板</span>
          </div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
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
        </aside>
      </section>
    </main>
  );
}

function BrandAssetList({
  assets,
  selectedId,
  onSelect
}: {
  assets: BrandAsset[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (!assets.length) {
    return <div className="mini-empty">未导入 SVG</div>;
  }
  return (
    <div className="brand-list">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          className={`brand-row ${asset.id === selectedId ? 'active' : ''}`}
          onClick={() => onSelect(asset.id)}
        >
          <span>
            <strong>{asset.name}</strong>
            <small>
              {asset.sourceKind.toUpperCase()} · {getBrandLanguageLabel(asset.language)}
              {asset.viewBoxSize ? ` · ${Math.round(asset.viewBoxSize.width)}x${Math.round(asset.viewBoxSize.height)}` : ''}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}

function BrandEffectControls({
  title,
  effect,
  onChange
}: {
  title: string;
  effect: BrandEffectState;
  onChange: (effect: BrandEffectState) => void;
}) {
  function patch(next: Partial<BrandEffectState>) {
    onChange({ ...effect, ...next });
  }

  return (
    <div className="brand-section effect-section">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      <div className="effect-grid">
        <label className="toggle">
          <input
            type="checkbox"
            checked={effect.colorEnabled}
            onChange={(event) => patch({ colorEnabled: event.target.checked })}
          />
          改色
        </label>
        <input
          className="color-input"
          type="color"
          value={effect.color}
          onChange={(event) => patch({ color: event.target.value })}
          aria-label={`${title} 颜色`}
        />

        <label className="toggle">
          <input
            type="checkbox"
            checked={effect.strokeEnabled}
            onChange={(event) => patch({ strokeEnabled: event.target.checked })}
          />
          描边
        </label>
        <input
          className="color-input"
          type="color"
          value={effect.strokeColor}
          onChange={(event) => patch({ strokeColor: event.target.value })}
          aria-label={`${title} 描边颜色`}
        />
        <label className="range-field">
          <span>粗细</span>
          <input
            type="range"
            min="1"
            max="8"
            step="1"
            value={effect.strokeWidth}
            onChange={(event) => patch({ strokeWidth: Number(event.target.value) })}
          />
        </label>

        <label className="toggle">
          <input checked={effect.glowEnabled} type="checkbox" onChange={(event) => patch({ glowEnabled: event.target.checked })} />
          外发光
        </label>
        <input
          className="color-input"
          type="color"
          value={effect.glowColor}
          onChange={(event) => patch({ glowColor: event.target.value })}
          aria-label={`${title} 外发光颜色`}
        />
        <label className="range-field">
          <span>强度</span>
          <input
            type="range"
            min="2"
            max="32"
            step="1"
            value={effect.glowBlur}
            onChange={(event) => patch({ glowBlur: Number(event.target.value) })}
          />
        </label>

        <label className="toggle">
          <input
            checked={effect.shadowEnabled}
            type="checkbox"
            onChange={(event) => patch({ shadowEnabled: event.target.checked })}
          />
          阴影
        </label>
        <input
          className="color-input"
          type="color"
          value={effect.shadowColor}
          onChange={(event) => patch({ shadowColor: event.target.value })}
          aria-label={`${title} 阴影颜色`}
        />
        <label className="range-field">
          <span>模糊</span>
          <input
            type="range"
            min="2"
            max="36"
            step="1"
            value={effect.shadowBlur}
            onChange={(event) => patch({ shadowBlur: Number(event.target.value) })}
          />
        </label>
        <label className="range-field">
          <span>Y</span>
          <input
            type="range"
            min="-24"
            max="24"
            step="1"
            value={effect.shadowOffsetY}
            onChange={(event) => patch({ shadowOffsetY: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
