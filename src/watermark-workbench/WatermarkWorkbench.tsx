import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Tooltip from '@radix-ui/react-tooltip';
import { WatermarkSlider } from './WatermarkSlider';
import { ImageUp, ShieldCheck } from 'lucide-react';
import { AssetSidebar, BoardOverview, SpecPanel, ToolPageHeader } from '../components';
import { Select as AppSelect, trackPointerHighlight } from '../components/ui';
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
import type { WatermarkConfig, WatermarkDensity } from '../core/image/watermarkRenderPlan';
import { ConfirmationDialog } from '../modules/media-workbench/ConfirmationDialog';
import { useMediaAssetActions } from '../modules/media-workbench/useMediaAssetActions';
import { useWatermarkLogoAsset } from './useWatermarkLogoAsset';
import type { MediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import { useOptionalAppRuntime, type AppNavigationTarget } from '../app/AppRuntimeProvider';
import { chooseOutputTarget, saveBlobToOutputTarget } from '../platform/fileSystem';
import { exportSequentially } from '../services/export/exportBatch';
import { buildWatermarkRenderInput } from './watermarkExport';
import { notify } from '../components/ui/toastBus';
import { createExportBatchId, exportStatusStore, formatExportSize } from '../components/export-status/exportStatusStore';

export type WatermarkBusinessConfig = {
  contentKind: 'text' | 'logo';
  text: string;
  fontSize: number; // percentage of short canvas edge, default 5
  rotation: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
  pattern: 'single' | 'brick';
  density: WatermarkDensity;
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

export const WATERMARK_DENSITY_LABELS: Record<WatermarkDensity, string> = {
  dense: '密集',
  standard: '适中',
  sparse: '稀疏',
};

export const DEFAULT_CONFIG: WatermarkBusinessConfig = {
  contentKind: 'text',
  text: '\u00a9KURO GAMES ALL RIGHTS RESERVED',
  fontSize: 5,
  rotation: 45,
  opacity: 0.5,
  offsetX: 0,
  offsetY: 0,
  pattern: 'brick',
  density: 'dense',
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
  const common: Pick<WatermarkConfig, 'pattern' | 'rotation' | 'opacity' | 'offsetX' | 'offsetY' | 'phaseOffset' | 'density'> = {
    pattern: config.pattern === 'single' ? 'single' : 'brick',
    rotation: config.rotation,
    opacity: config.opacity,
    offsetX,
    offsetY,
    phaseOffset: config.phaseOffset,
    density: config.density,
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

export function WatermarkWorkbench({
  onReturn,
  sharedState,
  onOpenChangelog,
}: {
  onReturn: () => void;
  sharedState: MediaWorkbenchState;
  onOpenChangelog?: () => void;
}) {
  const runtime = useOptionalAppRuntime();
  const {
    assets, setAssets, selectedAssetId, setSelectedAssetId, setSelectedSpecId,
    previewStates, setPreviewStates, focusAssetId, setFocusAssetId, setFocusSpecId,
    setImportFailures, importFailures, message: sharedMessage, setMessage: setSharedMessage,
    setPendingConfirmation, dispatchBoardBrand, exporting, setExporting,
  } = sharedState;
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const watermarkAssetIdsRef = useRef(new Set<string>());

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
  const [pendingNavigation, setPendingNavigation] = useState<AppNavigationTarget>();
  const logo = useWatermarkLogoAsset();
  const logoAsset = logo.asset;
  const dirty = (Object.keys(DEFAULT_CONFIG) as (keyof WatermarkBusinessConfig)[])
    .some((key) => config[key] !== DEFAULT_CONFIG[key])
    || Object.keys(overrides).length > 0
    || outputSize !== 'original'
    || assets.some((asset) => watermarkAssetIdsRef.current.has(asset.id))
    || Boolean(logoAsset)
    || exporting;

  useEffect(() => {
    if (!runtime) return;
    return runtime.registerNavigationGuard((target) => {
      if (!dirty) return true;
      setPendingNavigation(target);
      return false;
    });
  }, [dirty, runtime]);

  const selectedAsset = useMemo(() => assets.find((a) => a.id === selectedAssetId) ?? assets[0], [assets, selectedAssetId]);
  const effectiveAssetId = selectedAsset?.id;
  const override = useMemo(() => effectiveAssetId ? overrides[effectiveAssetId] : undefined, [effectiveAssetId, overrides]);

  const setWatermarkAssets = useCallback((update: SetStateAction<MaterialAsset[]>) => {
    setAssets((previous) => {
      const next = typeof update === 'function' ? update(previous) : update;
      const previousIds = new Set(previous.map((asset) => asset.id));
      for (const asset of next) if (!previousIds.has(asset.id)) watermarkAssetIdsRef.current.add(asset.id);
      return next;
    });
  }, [setAssets]);

  const { handleImageFiles, requestDeleteAsset } = useMediaAssetActions({
    assets,
    selectedAssetId: effectiveAssetId,
    focusAssetId,
    imageInputRef,
    focusReturnRef,
    setAssets: setWatermarkAssets,
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
      const batchId = createExportBatchId('wm');
      items.forEach((item, index) => {
        const dot = item.fileName.lastIndexOf('.');
        exportStatusStore.upsert({
          id: `${batchId}:${index}`,
          batchId,
          source: 'image-watermark',
          name: dot > 0 ? item.fileName.slice(0, dot) : item.fileName,
          extension: item.spec.format,
          width: item.spec.width,
          height: item.spec.height,
          progress: 0,
          status: 'queued'
        });
      });
      // 任务已注册后，显式展开并聚焦全局导出中心，避免只依赖隐式的新批次展开。
      exportStatusStore.requestOpen();
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
      }, {
        onProgress: ({ current, total }) => setSharedMessage(`正在导出 ${current}/${total}…`),
        onItemStart: (_item, index) => exportStatusStore.patch(`${batchId}:${index}`, { status: 'exporting' }),
        onItemResult: (_item, index, outcome) => {
          if (outcome.result === 'failed') {
            exportStatusStore.patch(`${batchId}:${index}`, { status: 'failed', error: outcome.reason });
            return;
          }
          exportStatusStore.patch(`${batchId}:${index}`, {
            status: 'completed',
            progress: 100,
            size: formatExportSize(outcome.outputBytes),
            outputPath: outcome.actualFileName
          });
        }
      });
      setSharedMessage('');
      if (result.failures.length) {
        notify('error', `已导出 ${result.completed} 张，${result.failures.length} 张失败：${result.failures[0].message}`);
      } else {
        notify('success', `已导出 ${result.completed} 张图片`);
      }
    } catch (err) {
      setSharedMessage('');
      notify('error', `导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }, [assets, config, exporting, logoAsset, outputSize, overrides, previewStates, setExporting, setSharedMessage]);

  const canExport = Boolean(assets.length) && !exporting && (config.contentKind === 'logo' ? Boolean(logoAsset) : Boolean(config.text.trim()));

  const requestReturn = () => {
    if (dirty) setShowReturnConfirm(true); else onReturn();
  };

  const discardWatermarkWork = () => {
    const ownedIds = new Set(watermarkAssetIdsRef.current);
    for (const asset of assets) if (ownedIds.has(asset.id)) releaseMaterialAsset(asset);
    setAssets((previous) => previous.filter((asset) => !ownedIds.has(asset.id)));
    watermarkAssetIdsRef.current.clear();
    setSelectedAssetId(undefined);
    setSelectedSpecId(undefined);
    setPreviewStates({});
    setFocusAssetId(undefined);
    setFocusSpecId(undefined);
    setPendingConfirmation(undefined);
    setConfig(DEFAULT_CONFIG);
    setOverrides({});
    setOutputSize('original');
    setSharedMessage('');
    setImportFailures([]);
    logo.clearLogo();
    setShowReturnConfirm(false);
    setPendingNavigation(undefined);
  };

  function leaveTo(target: AppNavigationTarget) {
    setPendingNavigation(undefined);
    if (target === 'media' || target === 'custom') {
      // Watermark workbench never exposes module-level navigation, but keep the
      // branch exhaustive in case the guard receives a module target.
      runtime?.setActiveModule(target);
      return;
    }
    runtime?.setActiveTool(target);
  }

  return (
    <div className="embedded-tool-wrapper wm-image-workspace">
      <ToolPageHeader
        title="水印工具"
        description="设置文字或 Logo 水印参数，预览当前素材并导出。"
        status="available"
        icon={<ShieldCheck size={20} strokeWidth={1.6} />}
        onReturn={requestReturn}
        showReturn={false}
        onOpenChangelog={onOpenChangelog}
      />
      <section className="workspace wm-workspace">
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
              <div className="drop-zone pointer-highlight" role="button" tabIndex={0} onPointerMove={trackPointerHighlight} onClick={() => imageInputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); imageInputRef.current?.click(); } }}>
                <ImageUp size={22} aria-hidden="true" />
                <strong>上传主视觉 / 已设计图</strong>
                <span>支持一次选择多张图片，本地读取尺寸与缩略图。</span>
              </div>
            ) : assets.map((asset) => (
              <div key={asset.id} className={`asset-row pointer-highlight ${asset.id === effectiveAssetId ? 'active' : ''}`} onPointerMove={trackPointerHighlight}>
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
              <AppSelect value={config.pattern} onChange={(value) => updateConfig('pattern', value as 'single' | 'brick')} aria-label="排列方式" options={[{ value: 'single', label: '单个' }, { value: 'brick', label: '砖型平铺' }]} />
            </label>
            {config.pattern !== 'single' && (
              <>
                <label className="wm-prop"><span>平铺密度</span>
                  <AppSelect value={config.density} onChange={(value) => updateConfig('density', value as WatermarkDensity)} aria-label="平铺密度" options={(Object.keys(WATERMARK_DENSITY_LABELS) as WatermarkDensity[]).map((density) => ({ value: density, label: WATERMARK_DENSITY_LABELS[density] }))} />
                </label>
                <WatermarkSlider label="砖型错位" value={Math.round(config.phaseOffset * 100)} min={0} max={100} step={1} onChange={(v) => updateConfig('phaseOffset', v / 100)} formatValue={(v) => `${v}%`} />
              </>
            )}
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>输出</h3></div>
            <label className="wm-prop"><span>尺寸</span><AppSelect aria-label="输出尺寸" value={outputSize} onChange={(value) => setOutputSize(value as WatermarkOutputSize)} options={(Object.keys(WATERMARK_OUTPUT_LABELS) as WatermarkOutputSize[]).map((size) => {
                const nextSpec = selectedAsset ? createWatermarkOutputSpec(selectedAsset, size) : undefined;
                return { value: size, label: `${WATERMARK_OUTPUT_LABELS[size]}${nextSpec ? ` · ${nextSpec.width} × ${nextSpec.height}` : ''}` };
              })} /></label>
            <p className="wm-hint">仅等比缩放，不改变原图长宽比。</p>
          </div>
          </div>
        </SpecPanel>
      </section>
      {showReturnConfirm && (
        <ConfirmationDialog
          title="放弃当前图片水印工作？"
          message={exporting ? '当前正在导出，返回后导出工作与未输出内容可能被中断。' : '当前图片水印参数或素材尚未输出，返回后这些临时内容会被清空。'}
          details={["部分设置仅临时保存在本机，未导出的内容仍可能丢失。"]}
          cancelLabel="继续编辑"
          confirmLabel="放弃并返回"
          destructive
          onCancel={() => setShowReturnConfirm(false)}
          onConfirm={() => { discardWatermarkWork(); onReturn(); }}
        />
      )}
      {pendingNavigation && (
        <ConfirmationDialog
          title="放弃当前图片水印工作？"
          message={exporting ? '当前正在导出，切换后导出工作与未输出内容可能被中断。' : '当前图片水印参数或素材尚未输出，切换后这些临时内容会被清空。'}
          details={["部分设置仅临时保存在本机，未导出的内容仍可能丢失。"]}
          cancelLabel="继续编辑"
          confirmLabel="放弃并切换"
          destructive
          onCancel={() => setPendingNavigation(undefined)}
          onConfirm={() => { const target = pendingNavigation; discardWatermarkWork(); leaveTo(target); }}
        />
      )}
    </div>
  );
}
