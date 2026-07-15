import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_MAX_SIZE_KB, buildOutputFileName, estimateExportBytes, formatMegabytes, getBoardPreviewKey, getEffectiveMaxSizeKb, getBrandLanguageLabel, resolveCprState,
  type BoardBrandStateMap, type BoardPreviewState, type BrandAsset, type BrandLanguage, type BrandLayerState, type CprState, type LogoGroupState, type MaterialAsset, type MaterialFormat, type MaterialSpec
} from '../../core';
import { buildExportMatrix, getExportLanguage, resolveExportLanguages, exportBoard } from '../../services/export';
import { chooseOutputTarget, saveBlobToOutputTarget } from '../../platform/fileSystem';
import { ExportDialog } from '../../components/ExportDialog';
import { BoardCanvas } from '../../components/canvas';
import { useBatchExportController } from './useBatchExportController';

export function BatchExportDialog({
  assets,
  specs,
  previewStates,
  brandAssets,
  brandLayer,
  boardBrandStates,
  onClose,
  onComplete,
  onExportingChange
}: {
  assets: MaterialAsset[];
  specs: MaterialSpec[];
  previewStates: Record<string, BoardPreviewState>;
  brandAssets: BrandAsset[];
  brandLayer: BrandLayerState;
  boardBrandStates: BoardBrandStateMap;
  onClose: () => void;
  onComplete: (message: string) => void;
  onExportingChange?: (exporting: boolean) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [exportAllLanguages, setExportAllLanguages] = useState(false);
  const languageResolutions = useMemo(() => resolveExportLanguages(brandAssets), [brandAssets]);
  const missingLanguages = useMemo(() => languageResolutions.filter((item) => item.missing).map((item) => item.language), [languageResolutions]);
  const items = useMemo(() => buildExportMatrix(assets, specs, exportAllLanguages), [assets, specs, exportAllLanguages]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(items.map((item) => item.id)));
  const [activeItemId, setActiveItemId] = useState(items[0]?.id);
  const [format, setFormat] = useState<MaterialFormat>('png');
  const [quality, setQuality] = useState(0.9);
  const [defaultMaxSizeMb, setDefaultMaxSizeMb] = useState(8);
  const [autoCompressJpeg, setAutoCompressJpeg] = useState(true);
  const [batchName, setBatchName] = useState('material');

  useEffect(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
    setActiveItemId(items[0]?.id);
  }, [items]);

  const activeItem = items.find((item) => item.id === activeItemId) ?? items[0];
  const activeAsset = assets.find((asset) => asset.id === activeItem?.assetId);
  const activeSpec = specs.find((spec) => spec.id === activeItem?.specId);
  const activePreviewState = activeAsset && activeSpec
    ? previewStates[getBoardPreviewKey(activeAsset.id, activeSpec.id)]
    : undefined;
  // Export deliberately reads the workspace state as-is. It must not create a
  // second, divergent set of Logo / CPR choices inside the export dialog.
  const exportLogo = brandAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const exportCpr = brandAssets.find((asset) => asset.id === brandLayer.selectedCprId);
  const activeBoardLogoGroup = activeAsset && activeSpec
    ? boardBrandStates[getBoardPreviewKey(activeAsset.id, activeSpec.id)]?.logo
    : undefined;
  const activeCompanyLogo = brandAssets.find((asset) => asset.id === activeBoardLogoGroup?.companyLogoId)
    ?? brandAssets.find((asset) => asset.type === 'logo' && asset.language === 'custom');
  const activeLanguage = (activeItem && 'language' in activeItem ? activeItem.language : brandLayer.logoLanguage) as BrandLanguage;
  const activeGameLogo = brandAssets.find((asset) => asset.type === 'logo' && asset.language === activeLanguage);
  const activeCprState = activeAsset && activeSpec ? boardBrandStates[getBoardPreviewKey(activeAsset.id, activeSpec.id)]?.cpr ?? resolveCprState(brandLayer) : resolveCprState(brandLayer);

  const rows = items.map((item, index) => {
    const asset = assets.find((candidate) => candidate.id === item.assetId);
    const spec = specs.find((candidate) => candidate.id === item.specId);
    if (!asset || !spec) return undefined;
    const estimatedBytes = estimateExportBytes(asset, spec, format, quality);
    const fileName = buildOutputFileName(
      { ...spec, format },
      {
        batchName,
        sourceName: asset.fileName.replace(/\.[^.]+$/g, ''),
        language: brandLayer.logoEnabled ? (('language' in item ? item.language : brandLayer.logoLanguage) as BrandLanguage) : undefined,
        index
      }
    );
    const effectiveMaxSizeKb = getEffectiveMaxSizeKb(spec, Math.round(defaultMaxSizeMb * 1024) || DEFAULT_MAX_SIZE_KB);
    return { item, asset, spec, estimatedBytes, effectiveMaxSizeKb, fileName };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

  const selectedRows = rows.filter((row) => selectedIds.has(row.item.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  type ExportRow = (typeof selectedRows)[number];
  const controller = useBatchExportController<ExportRow>();
  const { exporting, progress, errorMessage } = controller;

  useEffect(() => { onExportingChange?.(exporting); }, [exporting, onExportingChange]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !exporting) onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exporting, onClose]);

  function toggleItem(itemId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((row) => row.item.id)));
  }

  async function exportSelectedFiles() {
    if (!selectedRows.length || exporting) return;
    const outputTarget = await chooseOutputTarget();
    if (outputTarget.kind === 'cancelled') return;
    const batchResult = await controller.run(selectedRows, async (row) => {
      const previewState = previewStates[getBoardPreviewKey(row.asset.id, row.spec.id)];
      if (!previewState) {
        throw new Error(`${row.fileName}：缺少画板预览状态`);
      }
      const boardBrandState = boardBrandStates[getBoardPreviewKey(row.asset.id, row.spec.id)];
      if (!boardBrandState) throw new Error(`${row.fileName}：缺少画板品牌状态`);
      const boardLogoGroup = boardBrandState.logo;
      const boardCompanyLogo = brandAssets.find((asset) => asset.id === boardLogoGroup?.companyLogoId)
        ?? brandAssets.find((asset) => asset.type === 'logo' && asset.language === 'custom');
      const exportLanguage = getExportLanguage(row.item, brandLayer.logoLanguage);
      const boardGameLogo = brandAssets.find((asset) => asset.type === 'logo' && asset.language === exportLanguage);
      if (brandLayer.logoEnabled && !boardGameLogo) throw new Error(`缺少 ${getBrandLanguageLabel(exportLanguage)} Logo 资源`);
      const languageGroup = { ...boardLogoGroup, gameLogoLanguage: exportLanguage, gameLogoId: boardGameLogo?.id };
      const result = await exportBoard({
          asset: row.asset,
          spec: row.spec,
          previewState,
          brandLayer: { ...brandLayer, logoLanguage: exportLanguage, logoGroup: languageGroup, cprState: boardBrandState.cpr },
          logoAsset: exportLogo,
          cprAsset: exportCpr,
          companyLogoAsset: boardCompanyLogo,
          gameLogoAsset: boardGameLogo,
          format,
          quality,
          maxBytes: row.effectiveMaxSizeKb * 1024,
          autoCompressJpeg,
          minJpegQuality: 0.4
      });
      if (!result.ok) {
        const maxLabel = `${(row.effectiveMaxSizeKb / 1024).toFixed(row.effectiveMaxSizeKb % 1024 === 0 ? 0 : 1)}MB`;
        throw new Error(result.reason === 'png-over-limit' ? `PNG 实际为 ${formatMegabytes(result.size)}，超过 ${maxLabel}；请改用 JPG 或调整尺寸` : `在保持当前尺寸时无法压缩到 ${maxLabel} 以下，请降低尺寸或调整内容`);
      }
      await saveBlobToOutputTarget(outputTarget, row.fileName, result.blob);
      if (outputTarget.kind === 'downloads') await new Promise((resolve) => setTimeout(resolve, 180));
      return { info: result.compressed && result.quality ? `${row.fileName}：已自动压缩至 ${formatMegabytes(result.blob.size)}（${Math.round(result.quality * 100)}%）` : undefined };
    });
    if (!batchResult) return;
    if (batchResult.failures.length) {
      return;
    }
    onComplete(batchResult.info[0]?.message ?? `已导出 ${batchResult.completed} 个文件`);
    onClose();
  }

  const previewScale = activeSpec
    ? Math.min(720 / activeSpec.width, 560 / activeSpec.height, 1)
    : 1;

  return (
    <ExportDialog onClose={onClose} locked={exporting}>
      <section ref={dialogRef}>
        <div className="dialog-header export-dialog-header">
          <div>
            <span className="dialog-kicker">批量导出</span>
            <h2 id="export-dialog-title">导出文件</h2>
            <small>逐张检查并直接写入文件夹，不生成压缩包</small>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={exporting} aria-label="关闭批量导出" title="关闭">×</button>
        </div>

        <div className="export-dialog-body">
          <aside className="export-file-panel">
            <div className="export-column-heading">
              <label className="toggle">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                全选
              </label>
              <span>{selectedRows.length} / {rows.length}</span>
            </div>
            <div className="export-file-list">
              {rows.map((row) => {
                const overLimit = row.estimatedBytes > row.effectiveMaxSizeKb * 1024;
                return (
                  <div key={row.item.id} className={`export-file-row ${row.item.id === activeItem?.id ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.item.id)}
                      onChange={() => toggleItem(row.item.id)}
                      aria-label={`选择 ${row.fileName}`}
                    />
                    <button type="button" onClick={() => setActiveItemId(row.item.id)}>
                      <strong>{row.fileName}</strong>
                      <span>{row.spec.width} x {row.spec.height}</span>
                      <small className={overLimit ? 'size-warning' : ''}>
                        预计 {formatMegabytes(row.estimatedBytes)}{overLimit ? ` · 超过${row.spec.maxSizeKb ? '规格限制 ' : ' '}${(row.effectiveMaxSizeKb / 1024).toFixed(row.effectiveMaxSizeKb % 1024 === 0 ? 0 : 1)}MB` : ''}
                      </small>
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="export-preview-panel">
            <div className="export-column-heading">
              <span>预览</span>
              {activeSpec ? <span>{activeSpec.width} x {activeSpec.height}</span> : null}
            </div>
            <div className="export-preview-stage">
              {activeSpec ? (
                <BoardCanvas
                  asset={activeAsset}
                  spec={activeSpec}
                  previewState={activePreviewState}
                  logoAsset={exportLogo}
                  cprAsset={exportCpr}
                  brandLayer={{
                    ...brandLayer,
                    logoGroup: activeBoardLogoGroup,
                    cprState: activeCprState
                  }}
                  overlayCompanyLogo={activeCompanyLogo}
                  overlayGameLogo={activeGameLogo}
                  scale={previewScale}
                />
              ) : (
                <div className="empty-state">没有可导出的画板</div>
              )}
            </div>
            {activeAsset && activeSpec ? (
              <div className="export-preview-meta">
                <span>{activeAsset.fileName}</span>
                <span>{activeSpec.name}</span>
              </div>
            ) : null}
          </section>

          <aside className="export-settings-panel">
            <div className="export-column-heading">
              <span>导出设置</span>
            </div>
            <label className="export-field">
              <span>批次名</span>
              <input value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="material" />
            </label>
            <div className="export-field">
              <span>格式</span>
              <div className="segmented-control export-format-control">
                <button type="button" className={format === 'png' ? 'active' : ''} onClick={() => setFormat('png')}>PNG</button>
                <button type="button" className={format === 'jpg' ? 'active' : ''} onClick={() => setFormat('jpg')}>JPG</button>
              </div>
            </div>
            {format === 'jpg' ? (
              <label className="export-field">
                <span>JPG 质量 {Math.round(quality * 100)}%</span>
                <input type="range" min="0.4" max="1" step="0.01" value={quality} onChange={(event) => setQuality(Number(event.target.value))} />
              </label>
            ) : null}
            <label className="export-field">
              <span>指定</span>
              <div className="export-limit-input"><input aria-label="指定 MB" type="number" min="0.1" max="100" step="0.1" value={defaultMaxSizeMb} onChange={(event) => setDefaultMaxSizeMb(Math.min(100, Math.max(0.1, Number(event.target.value) || 8)))} /><small>MB</small></div>
            </label>
            {format === 'jpg' ? <label className="toggle"><input type="checkbox" checked={autoCompressJpeg} onChange={(event) => setAutoCompressJpeg(event.target.checked)} />JPG 超限时自动压缩</label> : null}
          <div className="export-summary-box">
            <span>已选 {selectedRows.length} 个文件</span>
          </div>
          <label className="toggle"><input type="checkbox" checked={exportAllLanguages} onChange={(event) => setExportAllLanguages(event.target.checked)} />全部语种分别导出（5 种）</label>
          {exportAllLanguages && missingLanguages.length ? <p className="size-warning">缺少资源：{missingLanguages.map(getBrandLanguageLabel).join('、')}。补齐后才能导出。</p> : null}
            <p className="dialog-help">导出时优先选择文件夹直接写入；不支持时会改为浏览器逐个下载。</p>
          </aside>
        </div>

        <div className="dialog-footer export-footer">
          <div className="export-status" aria-live="polite">
            <span>{exporting ? `正在导出 ${progress.current} / ${progress.total}` : '每张图独立输出'}</span>
            <strong className="export-error" title={errorMessage}>{errorMessage || ' '}</strong>
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={exporting}>取消</button>
            <button type="button" className="primary-button" onClick={() => void exportSelectedFiles()} disabled={!selectedRows.length || exporting || (exportAllLanguages && missingLanguages.length > 0)}>
              {exporting ? '正在导出...' : `导出 ${selectedRows.length} 个文件`}
            </button>
          </div>
        </div>
      </section>
    </ExportDialog>
  );
}
