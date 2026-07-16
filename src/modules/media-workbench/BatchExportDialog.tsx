import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_MAX_SIZE_KB, EXPORT_LANGUAGES, buildOutputFileName, estimateExportBytes, formatMegabytes, getBoardPreviewKey, getEffectiveMaxSizeKb, getBrandLanguageLabel, resolveBoardBrandAssets, resolveCprState,
  type BoardBrandStateMap, type BoardPreviewState, type BrandAsset, type BrandLanguage, type BrandLayerState, type CprState, type LogoGroupState, type MaterialAsset, type MaterialFormat, type MaterialSpec
} from '../../core';
import { buildExportMatrixForLanguages, getSelectedExportLanguages, resolveExportLanguages, type ExportLanguageSelection, type ExportSizePolicy, type MediaExportRow } from '../../services/export';
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
  baseLanguage,
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
  baseLanguage: BrandLanguage;
  onClose: () => void;
  onComplete: (message: string) => void;
  onExportingChange?: (exporting: boolean) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [exportAllLanguages, setExportAllLanguages] = useState(false);
  const [additionalLanguages, setAdditionalLanguages] = useState<BrandLanguage[]>([]);
  const languageResolutions = useMemo(() => resolveExportLanguages(brandAssets), [brandAssets]);
  const languageSelection = useMemo<ExportLanguageSelection>(() => ({
    baseLanguage,
    additionalLanguages: exportAllLanguages ? EXPORT_LANGUAGES.filter((language) => language !== baseLanguage) : additionalLanguages
  }), [additionalLanguages, baseLanguage, exportAllLanguages]);
  const selectedLanguages = useMemo(() => getSelectedExportLanguages(languageSelection), [languageSelection]);
  const items = useMemo(() => buildExportMatrixForLanguages(assets, specs, languageSelection), [assets, specs, languageSelection]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(items.map((item) => item.id)));
  const [activeItemId, setActiveItemId] = useState(items[0]?.id);
  const [format, setFormat] = useState<MaterialFormat>('png');
  const [quality, setQuality] = useState(0.9);
  const [sizePolicy, setSizePolicy] = useState<ExportSizePolicy>({ mode: 'default-limit', maxSizeKb: 8192 });
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
  const activeBoardLogoGroup = activeAsset && activeSpec
    ? boardBrandStates[getBoardPreviewKey(activeAsset.id, activeSpec.id)]?.logo
    : undefined;
  const activeLanguage = (activeItem && 'language' in activeItem ? activeItem.language : baseLanguage) as BrandLanguage;
  const activeCprState = activeAsset && activeSpec ? boardBrandStates[getBoardPreviewKey(activeAsset.id, activeSpec.id)]?.cpr ?? resolveCprState(brandLayer) : resolveCprState(brandLayer);
  const activeAssets = activeBoardLogoGroup
    ? resolveBoardBrandAssets({ boardBrandState: { logo: activeBoardLogoGroup, cpr: activeCprState }, brandCatalog: brandAssets, brandLayer, languageOverride: activeLanguage })
    : undefined;

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
        language: brandLayer.logoEnabled ? (('language' in item ? item.language : baseLanguage) as BrandLanguage) : undefined,
        index
      }
    );
    const effectiveMaxSizeKb = sizePolicy.mode === 'unlimited'
      ? Number.MAX_SAFE_INTEGER
      : getEffectiveMaxSizeKb(spec, sizePolicy.mode === 'custom' ? sizePolicy.maxSizeKb : sizePolicy.maxSizeKb || DEFAULT_MAX_SIZE_KB);
    return { item, asset, spec, estimatedBytes, effectiveMaxSizeKb, fileName };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));

  const selectedRows = rows.filter((row) => selectedIds.has(row.item.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  type ExportRow = MediaExportRow;
  const controller = useBatchExportController();
  const { exporting, progress, errorMessage, result: batchResult } = controller;

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
    const completed = await controller.run({
      rows: selectedRows,
      previewStates,
      boardBrandStates,
      brandAssets,
      brandLayer,
      format,
      quality,
      autoCompressJpeg
    });
    if (completed && !completed.failures.length) onComplete(`已导出 ${completed.completed} 个文件`);
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
                  logoAsset={activeAssets?.gameLogo}
                  cprAsset={activeAssets?.cpr}
                  brandLayer={{
                    ...brandLayer,
                    logoGroup: activeBoardLogoGroup,
                    cprState: activeCprState
                  }}
                  overlayCompanyLogo={activeAssets?.companyLogo}
                  overlayGameLogo={activeAssets?.gameLogo}
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
            <label className="export-field"><span>体积策略</span><select value={sizePolicy.mode} onChange={(event) => setSizePolicy(event.target.value === 'unlimited' ? { mode: 'unlimited' } : event.target.value === 'custom' ? { mode: 'custom', maxSizeKb: 8192 } : { mode: 'default-limit', maxSizeKb: 8192 })}><option value="default-limit">规格 / 默认 8MB</option><option value="custom">自定义上限</option><option value="unlimited">不限制</option></select></label>
            {sizePolicy.mode === 'custom' ? <label className="export-field"><span>指定</span><div className="export-limit-input"><input aria-label="指定 MB" type="number" min="0.1" max="100" step="0.1" value={sizePolicy.maxSizeKb / 1024} onChange={(event) => setSizePolicy({ mode: 'custom', maxSizeKb: Math.round(Math.min(100, Math.max(0.1, Number(event.target.value) || 8)) * 1024) })} /><small>MB</small></div></label> : null}
            {format === 'jpg' ? <label className="toggle"><input type="checkbox" checked={autoCompressJpeg} onChange={(event) => setAutoCompressJpeg(event.target.checked)} />JPG 超限时自动压缩</label> : null}
          <div className="export-summary-box">
            <span>已选 {selectedRows.length} 个文件</span>
            {batchResult ? <div className="export-result-list" aria-live="polite">{batchResult.outcomes.map(({ item, outcome }) => {
              const row = item as ExportRow;
              return <span key={row.item.id} className={`export-result is-${outcome.result}`}>{row.fileName} · {outcome.result === 'failed' ? `失败：${outcome.reason}` : outcome.result === 'compressed' ? `已压缩 ${(outcome.outputBytes / (1024 * 1024)).toFixed(2)} MB` : `完成 ${(outcome.outputBytes / (1024 * 1024)).toFixed(2)} MB`}</span>;
            })}</div> : null}
          </div>
          <div className="export-language-list"><span>当前语种（锁定）</span><span>{getBrandLanguageLabel(baseLanguage)}</span></div>
          <label className="toggle"><input type="checkbox" checked={exportAllLanguages} onChange={(event) => setExportAllLanguages(event.target.checked)} />全部语种分别导出（5 种）</label>
          {!exportAllLanguages ? <div className="export-language-list"><span>追加语种</span>{EXPORT_LANGUAGES.filter((language) => language !== baseLanguage).map((language) => <label key={language} className="toggle"><input type="checkbox" checked={additionalLanguages.includes(language)} onChange={(event) => setAdditionalLanguages((previous) => event.target.checked ? [...previous, language] : previous.filter((item) => item !== language))} />{getBrandLanguageLabel(language)}</label>)}</div> : null}
          {selectedLanguages.some((language) => languageResolutions.find((item) => item.language === language)?.missing) ? <p className="size-warning">缺少资源：{selectedLanguages.filter((language) => languageResolutions.find((item) => item.language === language)?.missing).map(getBrandLanguageLabel).join('、')}。补齐后才能导出。</p> : null}
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
            <button type="button" className="primary-button" onClick={() => void exportSelectedFiles()} disabled={!selectedRows.length || exporting || selectedLanguages.some((language) => languageResolutions.find((item) => item.language === language)?.missing)}>
              {exporting ? '正在导出...' : `导出 ${selectedRows.length} 个文件`}
            </button>
          </div>
        </div>
      </section>
    </ExportDialog>
  );
}
