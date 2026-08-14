import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Tooltip from '@radix-ui/react-tooltip';
import { WatermarkSlider } from './WatermarkSlider';
import { ShieldCheck } from 'lucide-react';
import { AssetSidebar, BoardOverview, SpecPanel, ToolPageHeader } from '../components';
import { BoardCanvas } from '../components/canvas';
import {
  createInitialCropState,
  buildOutputFileName,
  createMaterialAsset,
  DEFAULT_BRAND_LAYER,
  exportBoardImage,
  formatFileSize,
  getBoardPreviewKey,
  releaseMaterialAsset,
  type BoardPreviewState,
  type MaterialAsset,
  type MaterialSpec,
} from '../core';
import type { WatermarkConfig } from '../core/image/watermarkRenderPlan';
import { ConfirmationDialog } from '../modules/media-workbench/ConfirmationDialog';
import { useMediaAssetActions } from '../modules/media-workbench/useMediaAssetActions';
import { useWatermarkLogoAsset } from './useWatermarkLogoAsset';
import type { MediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import { chooseOutputTarget, saveBlobToOutputTarget } from '../platform/fileSystem';
import { exportSequentially } from '../services/export/exportBatch';
import { buildWatermarkRenderInput } from './watermarkExport';
import { VideoWatermarkWorkspace } from './VideoWatermarkWorkspace';
import type { MediaDesktopApi } from '../gif-media/mediaDesktop';

export type WatermarkBusinessConfig = {
  contentKind: 'text' | 'logo';
  text: string;
  fontSize: number; // percentage of short canvas edge, default 5
  rotation: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
  spacingX: number;
  spacingY: number;
  pattern: 'single' | 'tiled' | 'staggered';
  phaseOffset: number;
  anchor: WatermarkAnchor;
};

export type WatermarkOverride = {
  offsetX?: number;
  offsetY?: number;
  scale?: number;
};

export type WatermarkOutputSize = 'original' | 'large' | 'medium' | 'small';

export type WatermarkAnchor = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

const ANCHOR_OFFSETS: Record<WatermarkAnchor, { x: number; y: number }> = {
  'top-left': { x: -0.5, y: -0.5 },
  'top-center': { x: 0, y: -0.5 },
  'top-right': { x: 0.5, y: -0.5 },
  'middle-left': { x: -0.5, y: 0 },
  center: { x: 0, y: 0 },
  'middle-right': { x: 0.5, y: 0 },
  'bottom-left': { x: -0.5, y: 0.5 },
  'bottom-center': { x: 0, y: 0.5 },
  'bottom-right': { x: 0.5, y: 0.5 },
};

const WATERMARK_OUTPUT_SCALES: Record<WatermarkOutputSize, number> = {
  original: 1,
  large: 0.75,
  medium: 0.5,
  small: 0.25,
};

const WATERMARK_OUTPUT_LABELS: Record<WatermarkOutputSize, string> = {
  original: '原尺寸',
  large: '大尺寸（75%）',
  medium: '中尺寸（50%）',
  small: '小尺寸（25%）',
};

const DEFAULT_CONFIG: WatermarkBusinessConfig = {
  contentKind: 'text',
  text: '\u00a9KURO GAMES ALL RIGHTS RESERVED',
  fontSize: 5,
  rotation: 45,
  opacity: 0.5,
  offsetX: 0,
  offsetY: 0,
  spacingX: 220,
  spacingY: 160,
  pattern: 'tiled',
  phaseOffset: 0.5,
  anchor: 'center',
};

function imageFormat(path: string): 'png' | 'jpg' { return /\.jpe?g$/i.test(path) ? 'jpg' : 'png'; }
export function imageFormatForName(path: string): 'png' | 'jpg' { return imageFormat(path); }

export function createWatermarkOutputSpec(asset: MaterialAsset, size: WatermarkOutputSize): MaterialSpec {
  const scale = WATERMARK_OUTPUT_SCALES[size];
  return {
    id: `wm-${size}`,
    name: WATERMARK_OUTPUT_LABELS[size],
    width: Math.max(1, Math.round(asset.width * scale)),
    height: Math.max(1, Math.round(asset.height * scale)),
    format: imageFormat(asset.fileName),
  };
}

export function watermarkOutputName(path: string, spec: MaterialSpec, disambiguation?: string): string {
  const sourceName = path.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') || 'output';
  return buildOutputFileName(spec, { sourceName, disambiguation });
}

export function buildWatermarkExportItems(assets: MaterialAsset[], size: WatermarkOutputSize) {
  const items = assets.map((asset) => {
    const spec = createWatermarkOutputSpec(asset, size);
    return { asset, spec, baseName: watermarkOutputName(asset.fileName, spec) };
  });
  const totals = new Map<string, number>();
  const occurrences = new Map<string, number>();
  for (const item of items) totals.set(item.baseName, (totals.get(item.baseName) ?? 0) + 1);
  return items.map(({ asset, spec, baseName }) => {
    const occurrence = (occurrences.get(baseName) ?? 0) + 1;
    occurrences.set(baseName, occurrence);
    return {
      asset,
      spec,
      fileName: totals.get(baseName)! > 1 && occurrence > 1
        ? watermarkOutputName(asset.fileName, spec, String(occurrence))
        : baseName,
    };
  });
}

export function createWorkbenchWatermarkConfig(
  canvas: { width: number; height: number },
  config: WatermarkBusinessConfig,
  override?: WatermarkOverride,
  logoAsset?: MaterialAsset,
): WatermarkConfig | undefined {
  const short = Math.min(canvas.width, canvas.height);
  const sizePercent = config.fontSize / 100 * (override?.scale ?? 1);
  const anchor = ANCHOR_OFFSETS[config.anchor] ?? ANCHOR_OFFSETS.center;
  const anchorApplies = config.pattern === 'single';
  const offsetX = (anchorApplies ? anchor.x * canvas.width : 0) + (override?.offsetX ?? config.offsetX);
  const offsetY = (anchorApplies ? anchor.y * canvas.height : 0) + (override?.offsetY ?? config.offsetY);
  const common = {
    pattern: config.pattern,
    rotation: config.rotation,
    opacity: config.opacity,
    offsetX,
    offsetY,
    spacingX: config.spacingX,
    spacingY: config.spacingY,
    phaseOffset: config.phaseOffset,
  };
  if (config.contentKind === 'logo') {
    if (!logoAsset) return undefined;
    return {
      kind: 'image',
      src: logoAsset.objectUrl,
      intrinsicWidth: logoAsset.width,
      intrinsicHeight: logoAsset.height,
      displayWidth: Math.max(1, short * sizePercent),
      ...common,
    };
  }
  return {
    kind: 'text',
    text: config.text,
    fontFamily: 'Source Han Sans SC',
    color: '#ffffff',
    fontSize: Math.max(16, short * sizePercent),
    ...common,
  };
}

export type WatermarkWorkbenchMode = 'image' | 'video';

export function WatermarkWorkbench({
  onReturn,
  sharedState,
  initialMode = 'image',
  onModeChange,
  injectedVideoApi,
}: {
  onReturn: () => void;
  sharedState: MediaWorkbenchState;
  initialMode?: WatermarkWorkbenchMode;
  onModeChange?: (mode: WatermarkWorkbenchMode) => void;
  injectedVideoApi?: MediaDesktopApi;
}) {
  const {
    assets, setAssets, selectedAssetId, setSelectedAssetId, setSelectedSpecId,
    previewStates, setPreviewStates, focusAssetId, setFocusAssetId, setFocusSpecId,
    setImportFailures, importFailures, message: sharedMessage, setMessage: setSharedMessage,
    setPendingConfirmation, dispatchBoardBrand, exporting, setExporting,
  } = sharedState;
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);

  const [config, setConfig] = useState<WatermarkBusinessConfig>(DEFAULT_CONFIG);

  const [overrides, setOverrides] = useState<Record<string, WatermarkOverride>>({});
  const [outputSize, setOutputSize] = useState<WatermarkOutputSize>('original');
  const [showOriginal, setShowOriginal] = useState(false);
  const originalKeyHeldRef = useRef(false);

  const pressOriginal = useCallback(() => { originalKeyHeldRef.current = true; setShowOriginal(true); }, []);
  const releaseOriginal = useCallback(() => { originalKeyHeldRef.current = false; setShowOriginal(false); }, []);
  const handleOriginalKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (originalKeyHeldRef.current) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      pressOriginal();
    }
  }, [pressOriginal]);
  const handleOriginalKeyUp = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      releaseOriginal();
    }
  }, [releaseOriginal]);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [mode, setMode] = useState<WatermarkWorkbenchMode>(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const selectMode = useCallback((nextMode: WatermarkWorkbenchMode) => {
    setMode(nextMode);
    onModeChange?.(nextMode);
  }, [onModeChange]);

  const selectedAsset = useMemo(() => assets.find((a) => a.id === selectedAssetId) ?? assets[0], [assets, selectedAssetId]);
  const effectiveAssetId = selectedAsset?.id;
  const override = useMemo(() => effectiveAssetId ? overrides[effectiveAssetId] : undefined, [effectiveAssetId, overrides]);

  const { handleImageFiles, requestDeleteAsset } = useMediaAssetActions({
    assets,
    selectedAssetId: effectiveAssetId,
    focusAssetId,
    imageInputRef,
    focusReturnRef,
    setAssets,
    setSelectedAssetId,
    setSelectedSpecId,
    setPreviewStates,
    setFocusAssetId,
    setFocusSpecId,
    setImportFailures,
    setMessage: setSharedMessage,
    setPendingConfirmation,
    dispatchBoardBrand,
  });

  const spec = useMemo<MaterialSpec>(() => selectedAsset
    ? createWatermarkOutputSpec(selectedAsset, outputSize)
    : { id: `wm-${outputSize}`, name: WATERMARK_OUTPUT_LABELS[outputSize], width: 800, height: 600, format: 'png' }, [outputSize, selectedAsset]);
  const previewState = useMemo<BoardPreviewState | undefined>(() => {
    if (!selectedAsset) return undefined;
    return previewStates[getBoardPreviewKey(selectedAsset.id, spec.id)] ?? {
      assetId: selectedAsset.id,
      specId: spec.id,
      fitMode: 'contain',
      crop: createInitialCropState(selectedAsset, spec, 'contain'),
    };
  }, [previewStates, selectedAsset, spec]);

  const logo = useWatermarkLogoAsset();
  const logoAsset = logo.asset;
  const handleLogoFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    await logo.loadLogo(file);
    if (logo.error) setSharedMessage(`Logo 水印加载失败：${logo.error}`);
  }, [logo, setSharedMessage]);

  const watermarkCoreConfig = useMemo<WatermarkConfig | undefined>(() => {
    if (!selectedAsset) return undefined;
    return buildWatermarkRenderInput({ asset: selectedAsset, spec }, config, override, logoAsset, previewStates).watermarkConfig;
  }, [config, logoAsset, override, previewStates, selectedAsset, spec]);

  const updateConfig = useCallback(<K extends keyof WatermarkBusinessConfig>(key: K, value: WatermarkBusinessConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateOverride = useCallback((key: keyof WatermarkOverride, value: number) => {
    if (!effectiveAssetId) return;
    setOverrides((prev) => ({
      ...prev,
      [effectiveAssetId]: { ...prev[effectiveAssetId], [key]: value },
    }));
  }, [effectiveAssetId]);

  const resetOverride = useCallback(() => {
    if (!effectiveAssetId) return;
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[effectiveAssetId];
      return next;
    });
  }, [effectiveAssetId]);

  const applyCurrentWatermarkToOtherAssets = useCallback(() => {
    if (!selectedAsset || assets.length < 2) return;
    const sourceSpec = createWatermarkOutputSpec(selectedAsset, outputSize);
    const sourceOverride: Required<WatermarkOverride> = {
      offsetX: override?.offsetX ?? config.offsetX,
      offsetY: override?.offsetY ?? config.offsetY,
      scale: override?.scale ?? 1,
    };
    setOverrides((previous) => {
      const next = { ...previous, [selectedAsset.id]: sourceOverride };
      for (const asset of assets) {
        if (asset.id === selectedAsset.id) continue;
        const targetSpec = createWatermarkOutputSpec(asset, outputSize);
        next[asset.id] = {
          offsetX: sourceOverride.offsetX * targetSpec.width / sourceSpec.width,
          offsetY: sourceOverride.offsetY * targetSpec.height / sourceSpec.height,
          scale: sourceOverride.scale,
        };
      }
      return next;
    });
    setSharedMessage(`已将当前水印应用至 ${assets.length - 1} 张其他图片`);
  }, [assets, config.offsetX, config.offsetY, outputSize, override, selectedAsset, setSharedMessage]);

  const handleExport = useCallback(async () => {
    if (!assets.length || exporting || !config.text.trim()) return;
    try {
      const outputTarget = await chooseOutputTarget();
      if (outputTarget.kind === 'cancelled') return;
      setExporting(true);
      const items = buildWatermarkExportItems(assets, outputSize);
      setSharedMessage(`正在导出 0/${items.length}…`);
      const result = await exportSequentially(items, async (item) => {
        const itemPreviewState = previewStates[getBoardPreviewKey(item.asset.id, item.spec.id)] ?? {
          assetId: item.asset.id,
          specId: item.spec.id,
          fitMode: 'contain' as const,
          crop: createInitialCropState(item.asset, item.spec, 'contain'),
        };
        const renderInput = buildWatermarkRenderInput(item, config, overrides[item.asset.id], logoAsset, previewStates);
        const blob = await exportBoardImage(renderInput);
        const actualFileName = await saveBlobToOutputTarget(outputTarget, item.fileName, blob);
        return { result: 'success' as const, outputBytes: blob.size, actualFileName };
      }, ({ current, total }) => setSharedMessage(`正在导出 ${current}/${total}…`));
      setSharedMessage(result.failures.length
        ? `已导出 ${result.completed} 张，${result.failures.length} 张失败：${result.failures[0].message}`
        : `已导出 ${result.completed} 张图片`);
    } catch (err) {
      setSharedMessage(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }, [assets, config, exporting, logoAsset, outputSize, overrides, previewStates, setExporting, setSharedMessage]);

  const canExport = Boolean(assets.length) && !exporting && (config.contentKind === 'logo' ? Boolean(logoAsset) : Boolean(config.text.trim()));

  const requestReturn = () => {
    const dirty = (Object.keys(DEFAULT_CONFIG) as (keyof WatermarkBusinessConfig)[])
      .some((key) => config[key] !== DEFAULT_CONFIG[key])
      || Object.keys(overrides).length;
    if (dirty) setShowReturnConfirm(true); else onReturn();
  };

  return (
    <div className="embedded-tool-wrapper">
      <ToolPageHeader
        title="水印工具"
        description="设置文字或 Logo 水印参数，预览当前素材并导出。"
        status="available"
        icon={<ShieldCheck size={20} strokeWidth={1.6} />}
        onReturn={requestReturn}
      />
      <Tabs.Root value={mode} onValueChange={(value) => selectMode(value as WatermarkWorkbenchMode)}>
        <div className="wm-mode-tabs-wrap">
          <Tabs.List className="wm-mode-tabs" aria-label="水印工具模式">
            <Tabs.Trigger className="wm-mode-tab" value="image">图片</Tabs.Trigger>
            <Tabs.Trigger className="wm-mode-tab" value="video">视频</Tabs.Trigger>
          </Tabs.List>
        </div>
      {mode === 'video' ? (
        <Tabs.Content value="video"><VideoWatermarkWorkspace config={config} updateConfig={updateConfig} injectedApi={injectedVideoApi} /></Tabs.Content>
      ) : <Tabs.Content value="image"><section className="workspace wm-workspace">
        <AssetSidebar ariaLabel="水印素材">
          <div className="panel-heading">
            <h2>素材</h2>
            <button type="button" onClick={() => imageInputRef.current?.click()}>导入图片</button>
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
            ) : assets.map((asset) => (
              <div key={asset.id} className={`asset-row ${asset.id === effectiveAssetId ? 'active' : ''}`}>
                <button type="button" className="asset-select-button" onClick={() => setSelectedAssetId(asset.id)}>
                  <img src={asset.objectUrl} alt={asset.fileName} />
                  <span><strong>{asset.fileName}</strong><small>{asset.width} x {asset.height} · {formatFileSize(asset.fileSize)}</small></span>
                </button>
                <button type="button" className="asset-delete-button icon-button" onClick={(event) => { event.stopPropagation(); requestDeleteAsset(asset.id); }} aria-label={`删除素材 ${asset.fileName}`} title="删除素材">×</button>
              </div>
            ))}
          </div>
          {importFailures.length ? <div className="import-failures"><strong>失败文件</strong>{importFailures.map((failure) => <small key={failure}>{failure}</small>)}</div> : null}
        </AssetSidebar>

        <BoardOverview
          title="水印预览"
          subtitle={`${spec.name} · ${spec.width} × ${spec.height} · 按住画布查看原图`}
          exportLabel={exporting ? '导出中…' : assets.length > 1 ? `批量导出 ${assets.length} 张` : '导出水印'}
          exportAriaLabel="导出水印图片"
          disabled={!canExport}
          onExport={() => void handleExport()}
          message={sharedMessage}
        >
          <main className="wm-canvas-wrap" aria-label="水印预览画布" role="img"
            onPointerDown={pressOriginal} onPointerUp={releaseOriginal} onPointerCancel={releaseOriginal} onPointerLeave={releaseOriginal}>
            {selectedAsset && previewState ? (
              <BoardCanvas
                asset={selectedAsset}
                spec={spec}
                previewState={previewState}
                logoAsset={undefined}
                cprAsset={undefined}
                brandLayer={{ ...DEFAULT_BRAND_LAYER, logoEnabled: false, cprEnabled: false }}
                scale={Math.min(1, 700 / Math.max(spec.width, spec.height))}
                watermarkConfig={showOriginal ? undefined : watermarkCoreConfig}
                hideWatermark={showOriginal}
              />
            ) : (
              <div className="wm-empty-canvas">{assets.length ? '选择素材后在此预览水印效果' : '导入图片后在此预览水印效果'}</div>
            )}
          </main>
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button type="button" className="wm-btn wm-btn-pick wm-view-original" onPointerDown={pressOriginal} onPointerUp={releaseOriginal} onPointerCancel={releaseOriginal} onPointerLeave={releaseOriginal} onKeyDown={handleOriginalKeyDown} onKeyUp={handleOriginalKeyUp} onBlur={releaseOriginal} aria-pressed={showOriginal} disabled={!selectedAsset}>按住查看原图</button>
              </Tooltip.Trigger>
              <Tooltip.Portal><Tooltip.Content className="wm-tooltip-content" sideOffset={4}>按住显示原图，松开恢复水印</Tooltip.Content></Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </BoardOverview>

        <SpecPanel boardCount={selectedAsset ? 1 : 0} title="水印参数" countLabel={selectedAsset ? '当前素材' : '未选择素材'} ariaLabel="水印参数">
          <div className="wm-parameter-sections">
          <div className="wm-section">
            <div className="wm-section-head"><h3>水印内容</h3></div>
            <Tabs.Root value={config.contentKind} onValueChange={(v) => updateConfig('contentKind', v as 'text' | 'logo')}>
              <Tabs.List className="wm-tabs-list" aria-label="水印内容类型">
                <Tabs.Trigger className="wm-tabs-trigger" value="text">文字</Tabs.Trigger>
                <Tabs.Trigger className="wm-tabs-trigger" value="logo">Logo</Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
          </div>
          {config.contentKind === 'text' ? (
          <div className="wm-section">
            <div className="wm-section-head"><h3>文字</h3></div>
            <label className="wm-prop">
              <span>内容</span>
              <textarea value={config.text} onChange={(e) => updateConfig('text', e.target.value)} placeholder="支持多行文字，按 Enter 换行" rows={3} wrap="off" style={{ resize: 'vertical', minHeight: 48, width: '100%' }} />
            </label>
            <WatermarkSlider label="字号" value={config.fontSize} min={1} max={20} step={1} onChange={(v) => updateConfig('fontSize', v)} formatValue={(v) => `${v}%`} />
          </div>
          ) : (
          <div className="wm-section">
            <div className="wm-section-head"><h3>Logo 图片</h3></div>
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void handleLogoFiles(e.target.files)} />
            <button type="button" className="wm-btn wm-btn-pick" onClick={() => logoInputRef.current?.click()}>{logoAsset ? logoAsset.fileName : '选择 Logo 图片'}</button>
            {logo.error && <p className="wm-error">{logo.error}</p>}
            <WatermarkSlider label="大小" value={config.fontSize} min={1} max={50} step={1} onChange={(v) => updateConfig('fontSize', v)} formatValue={(v) => `${v}%`} />
          </div>
          )}
          <div className="wm-section">
            <div className="wm-section-head"><h3>位置与变换</h3></div>
            {config.pattern === 'single' && (
              <div className="wm-anchor-grid" role="group" aria-label="九宫格锚点">
                {(Object.keys(ANCHOR_OFFSETS) as WatermarkAnchor[]).map((anchor) => (
                  <button key={anchor} type="button" className={config.anchor === anchor ? 'active' : ''} onClick={() => updateConfig('anchor', anchor)} aria-pressed={config.anchor === anchor} aria-label={anchor} />
                ))}
              </div>
            )}
            <Collapsible.Root defaultOpen={false}>
              <Collapsible.Trigger className="wm-collapsible-trigger">当前图片高级微调 <span aria-hidden>▾</span></Collapsible.Trigger>
              <Collapsible.Content className="wm-collapsible-content">
                <div className="wm-prop-grid">
                  <WatermarkSlider label="X" value={override?.offsetX ?? config.offsetX} min={-Math.round(spec.width / 2)} max={Math.round(spec.width / 2)} step={1} onChange={(v) => updateOverride('offsetX', v)} disabled={!selectedAsset} formatValue={(v) => `${v}px`} />
                  <WatermarkSlider label="Y" value={override?.offsetY ?? config.offsetY} min={-Math.round(spec.height / 2)} max={Math.round(spec.height / 2)} step={1} onChange={(v) => updateOverride('offsetY', v)} disabled={!selectedAsset} formatValue={(v) => `${v}px`} />
                  <div className="wm-snap-btns"><button className="wm-btn-sm" onClick={resetOverride} disabled={!selectedAsset}>重置为全局</button></div>
                </div>
                <WatermarkSlider label="缩放" value={Math.round((override?.scale ?? 1) * 100)} min={20} max={200} step={1} onChange={(v) => updateOverride('scale', v / 100)} disabled={!selectedAsset} formatValue={(v) => `${v}%`} />
              </Collapsible.Content>
            </Collapsible.Root>
            <WatermarkSlider label="旋转" value={config.rotation} min={-180} max={180} step={1} onChange={(v) => updateConfig('rotation', v)} formatValue={(v) => `${v}°`} />
            <div className="wm-snap-btns" role="group" aria-label="角度预设">
              {[0, 45, -45, 90].map((deg) => (
                <button key={deg} type="button" onClick={() => updateConfig('rotation', deg)} aria-pressed={config.rotation === deg}>{deg}°</button>
              ))}
              <button type="button" onClick={() => updateConfig('rotation', 30)} aria-pressed={config.rotation === 30}>自定义</button>
            </div>
            <div className="brand-apply-actions"><span>应用范围</span><button type="button" onClick={applyCurrentWatermarkToOtherAssets} disabled={assets.length < 2}>其他图片</button></div>
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>外观</h3></div>
            <WatermarkSlider label="透明度" value={Math.round(config.opacity * 100)} min={0} max={100} step={1} onChange={(v) => updateConfig('opacity', v / 100)} formatValue={(v) => `${v}%`} />
            <label className="wm-prop"><span>排列</span>
              <Select.Root value={config.pattern} onValueChange={(v) => updateConfig('pattern', v as 'single' | 'tiled' | 'staggered')}>
                <Select.Trigger className="wm-select-trigger" aria-label="排列方式"><Select.Value /><Select.Icon /></Select.Trigger>
                <Select.Portal><Select.Content className="wm-select-content" position="popper">
                  <Select.Viewport>
                    <Select.Item value="single"><Select.ItemText>单个</Select.ItemText></Select.Item>
                    <Select.Item value="tiled"><Select.ItemText>规则平铺</Select.ItemText></Select.Item>
                    <Select.Item value="staggered"><Select.ItemText>错位平铺</Select.ItemText></Select.Item>
                  </Select.Viewport>
                </Select.Content></Select.Portal>
              </Select.Root>
            </label>
            {config.pattern !== 'single' && (
              <>
                <div className="wm-prop-row">
                  <label className="wm-prop"><span>横向间距</span><input type="number" value={config.spacingX} onChange={(e) => updateConfig('spacingX', Number(e.target.value))} /></label>
                  <label className="wm-prop"><span>纵向间距</span><input type="number" value={config.spacingY} onChange={(e) => updateConfig('spacingY', Number(e.target.value))} /></label>
                </div>
                {config.pattern === 'staggered' && (
                  <WatermarkSlider label="相位偏移" value={Math.round(config.phaseOffset * 100)} min={0} max={100} step={1} onChange={(v) => updateConfig('phaseOffset', v / 100)} formatValue={(v) => `${v}%`} />
                )}
              </>
            )}
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>输出</h3></div>
            <label className="wm-prop"><span>尺寸</span><select aria-label="输出尺寸" value={outputSize} onChange={(event) => setOutputSize(event.target.value as WatermarkOutputSize)}>
              {(Object.keys(WATERMARK_OUTPUT_LABELS) as WatermarkOutputSize[]).map((size) => {
                const nextSpec = selectedAsset ? createWatermarkOutputSpec(selectedAsset, size) : undefined;
                return <option key={size} value={size}>{WATERMARK_OUTPUT_LABELS[size]}{nextSpec ? ` · ${nextSpec.width} × ${nextSpec.height}` : ''}</option>;
              })}
            </select></label>
            <p className="wm-hint">仅等比缩放，不改变原图长宽比。</p>
          </div>
          </div>
        </SpecPanel>
      </section></Tabs.Content>}
      </Tabs.Root>
      {showReturnConfirm && (
        <ConfirmationDialog
          title="放弃当前设置？"
          message="当前已修改水印参数，放弃后将不会保留。"
          confirmLabel="放弃并返回"
          destructive
          onCancel={() => setShowReturnConfirm(false)}
          onConfirm={() => onReturn()}
        />
      )}
    </div>
  );
}
