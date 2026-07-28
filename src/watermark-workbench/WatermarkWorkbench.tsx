import { useCallback, useMemo, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AssetSidebar, BoardOverview, SpecPanel, ToolPageHeader } from '../components';
import { BoardCanvas } from '../components/canvas';
import {
  createInitialCropState,
  buildOutputFileName,
  DEFAULT_BRAND_LAYER,
  exportBoardImage,
  formatFileSize,
  getBoardPreviewKey,
  type BoardPreviewState,
  type MaterialAsset,
  type MaterialSpec,
} from '../core';
import type { WatermarkConfig } from '../core/image/watermarkRenderPlan';
import { ConfirmationDialog } from '../modules/media-workbench/ConfirmationDialog';
import { useMediaAssetActions } from '../modules/media-workbench/useMediaAssetActions';
import type { MediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import { chooseOutputTarget, saveBlobToOutputTarget } from '../platform/fileSystem';
import { exportSequentially } from '../services/export/exportBatch';

export type WatermarkBusinessConfig = {
  text: string;
  fontSize: number; // percentage of short canvas edge, default 5
  rotation: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
  spacingX: number;
  spacingY: number;
  repeat: boolean;
};

export type WatermarkOverride = {
  offsetX?: number;
  offsetY?: number;
  scale?: number;
};

export type WatermarkOutputSize = 'original' | 'large' | 'medium' | 'small';

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
  text: '\u00a9KURO GAMES ALL RIGHTS RESERVED',
  fontSize: 5,
  rotation: 45,
  opacity: 0.5,
  offsetX: 0,
  offsetY: 0,
  spacingX: 220,
  spacingY: 160,
  repeat: true,
};

function imageFormat(path: string): 'png' | 'jpg' { return /\.jpe?g$/i.test(path) ? 'jpg' : 'png'; }

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
): WatermarkConfig {
  const fontSize = Math.max(1, Math.min(canvas.width, canvas.height) * config.fontSize / 100 * (override?.scale ?? 1));
  return {
    kind: 'text',
    text: config.text,
    fontFamily: 'Source Han Sans SC',
    color: '#ffffff',
    fontSize,
    pattern: config.repeat ? 'tiled' : 'single',
    rotation: config.rotation,
    opacity: config.opacity,
    offsetX: override?.offsetX ?? config.offsetX,
    offsetY: override?.offsetY ?? config.offsetY,
    spacingX: config.spacingX,
    spacingY: config.spacingY,
  };
}

export function WatermarkWorkbench({ onReturn, sharedState }: { onReturn: () => void; sharedState: MediaWorkbenchState }) {
  const {
    assets, setAssets, selectedAssetId, setSelectedAssetId, setSelectedSpecId,
    previewStates, setPreviewStates, focusAssetId, setFocusAssetId, setFocusSpecId,
    setImportFailures, importFailures, message: sharedMessage, setMessage: setSharedMessage,
    setPendingConfirmation, dispatchBoardBrand, exporting, setExporting,
  } = sharedState;
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);

  const [config, setConfig] = useState<WatermarkBusinessConfig>(DEFAULT_CONFIG);
  const [overrides, setOverrides] = useState<Record<string, WatermarkOverride>>({});
  const [outputSize, setOutputSize] = useState<WatermarkOutputSize>('original');
  const [showOriginal, setShowOriginal] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

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

  const watermarkCoreConfig = useMemo<WatermarkConfig | undefined>(() => {
    if (!selectedAsset) return undefined;
    return createWorkbenchWatermarkConfig(spec, config, override);
  }, [config, override, selectedAsset, spec]);

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
        const blob = await exportBoardImage({
          asset: item.asset,
          spec: item.spec,
          previewState: itemPreviewState,
          brandLayer: { ...DEFAULT_BRAND_LAYER, logoEnabled: false, cprEnabled: false },
          watermarkConfig: createWorkbenchWatermarkConfig(item.spec, config, overrides[item.asset.id]),
        });
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
  }, [assets, config, exporting, outputSize, overrides, previewStates, setExporting, setSharedMessage]);

  const canExport = Boolean(assets.length) && !exporting && Boolean(config.text.trim());

  const requestReturn = () => {
    const dirty = (Object.keys(DEFAULT_CONFIG) as (keyof WatermarkBusinessConfig)[])
      .some((key) => config[key] !== DEFAULT_CONFIG[key])
      || Object.keys(overrides).length;
    if (dirty) setShowReturnConfirm(true); else onReturn();
  };

  return (
    <div className="embedded-tool-wrapper">
      <ToolPageHeader
        title="水印与追溯"
        description="设置水印文字参数，预览当前素材并导出。"
        status="available"
        icon={<ShieldCheck size={20} strokeWidth={1.6} />}
        onReturn={requestReturn}
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
            onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} onPointerLeave={() => setShowOriginal(false)}>
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
        </BoardOverview>

        <SpecPanel boardCount={selectedAsset ? 1 : 0} title="水印参数" countLabel={selectedAsset ? '当前素材' : '未选择素材'} ariaLabel="水印参数">
          <div className="wm-parameter-sections">
          <div className="wm-section">
            <div className="wm-section-head"><h3>文字</h3></div>
            <label className="wm-prop">
              <span>内容</span>
              <textarea value={config.text} onChange={(e) => updateConfig('text', e.target.value)} placeholder="支持多行文字，按 Enter 换行" rows={3} wrap="off" style={{ resize: 'vertical', minHeight: 48, width: '100%' }} />
            </label>
            <label className="wm-prop"><span>字号 {config.fontSize}%</span><input type="range" min={1} max={20} value={config.fontSize} onChange={(e) => updateConfig('fontSize', Number(e.target.value))} /></label>
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>位置与变换</h3></div>
            <div className="wm-prop-grid">
              <label className="wm-prop"><span>X {override?.offsetX ?? config.offsetX}px</span><input type="range" min={-Math.round(spec.width / 2)} max={Math.round(spec.width / 2)} value={override?.offsetX ?? config.offsetX} onChange={(e) => updateOverride('offsetX', Number(e.target.value))} aria-label="水平位置偏移" disabled={!selectedAsset} /></label>
              <label className="wm-prop"><span>Y {override?.offsetY ?? config.offsetY}px</span><input type="range" min={-Math.round(spec.height / 2)} max={Math.round(spec.height / 2)} value={override?.offsetY ?? config.offsetY} onChange={(e) => updateOverride('offsetY', Number(e.target.value))} aria-label="垂直位置偏移" disabled={!selectedAsset} /></label>
              <div className="wm-snap-btns"><button className="wm-btn-sm" onClick={resetOverride} disabled={!selectedAsset}>重置为全局</button></div>
            </div>
            <label className="wm-prop"><span>缩放 {(override?.scale ?? 1) * 100}%</span><input type="range" min={20} max={200} value={(override?.scale ?? 1) * 100} onChange={(e) => updateOverride('scale', Number(e.target.value) / 100)} aria-label="水印缩放" disabled={!selectedAsset} /></label>
            <label className="wm-prop"><span>旋转 {config.rotation}°</span><input type="range" min={-180} max={180} value={config.rotation} onChange={(e) => updateConfig('rotation', Number(e.target.value))} /></label>
            <div className="brand-apply-actions"><span>应用范围</span><button type="button" onClick={applyCurrentWatermarkToOtherAssets} disabled={assets.length < 2}>其他图片</button></div>
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>外观</h3></div>
            <label className="wm-prop"><span>透明度 {Math.round(config.opacity * 100)}%</span><input type="range" min={0} max={100} value={Math.round(config.opacity * 100)} onChange={(e) => updateConfig('opacity', Number(e.target.value) / 100)} /></label>
            <label className="wm-prop wm-prop-toggle"><input type="checkbox" checked={config.repeat} onChange={(e) => updateConfig('repeat', e.target.checked)} /><span>平铺水印</span></label>
            {config.repeat && (
              <div className="wm-prop-row">
                <label className="wm-prop"><span>横向间距</span><input type="number" value={config.spacingX} onChange={(e) => updateConfig('spacingX', Number(e.target.value))} /></label>
                <label className="wm-prop"><span>纵向间距</span><input type="number" value={config.spacingY} onChange={(e) => updateConfig('spacingY', Number(e.target.value))} /></label>
              </div>
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
      </section>
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
