import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_MAX_SIZE_KB,
  EXPORT_LANGUAGES,
  getBoardPreviewKey,
  getBrandLanguageLabel,
  normalizeLogoGroup,
  type BoardBrandStateMap,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLanguage,
  type BrandLayerState,
  type BrandSettingsV1,
  type MaterialAsset,
  type MaterialFormat,
  type MaterialSpec
} from '../../core';
import { buildExportJobs, type ExportJob, type ExportLanguageMode, type ExportNamingMode, type ExportSizePolicy } from '../../services/export';
import { ExportDialog } from '../../components/ExportDialog';
import { BoardCanvas } from '../../components/canvas';
import { useBatchExportController } from './useBatchExportController';

export function BatchExportDialog({
  assets,
  specs,
  previewStates,
  brandAssets,
  brandLayer,
  brandSettings,
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
  brandSettings: BrandSettingsV1;
  boardBrandStates: BoardBrandStateMap;
  onClose: () => void;
  onComplete: (message: string) => void;
  onExportingChange?: (exporting: boolean) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [languageMode, setLanguageMode] = useState<ExportLanguageMode>('default');
  const [additionalLanguages, setAdditionalLanguages] = useState<BrandLanguage[]>([]);
  const [namingMode, setNamingMode] = useState<ExportNamingMode>('source-name');
  const [customNameByAsset, setCustomNameByAsset] = useState<Record<string, string>>({});
  const [batchName, setBatchName] = useState('');
  const [format, setFormat] = useState<MaterialFormat>('png');
  const [quality, setQuality] = useState(0.9);
  const [sizePolicy, setSizePolicy] = useState<ExportSizePolicy>({ mode: 'default-limit', maxSizeKb: DEFAULT_MAX_SIZE_KB });
  const [autoCompressJpeg, setAutoCompressJpeg] = useState(true);

  const jobs = useMemo(() => buildExportJobs({
    assets,
    specs,
    previewStates,
    boardBrandStates,
    brandAssets,
    brandLayer,
    brandSettings,
    format,
    quality,
    sizePolicy,
    languageMode,
    additionalLanguages,
    namingMode,
    customNameByAsset,
    batchName
  }), [assets, specs, previewStates, boardBrandStates, brandAssets, brandLayer, brandSettings, format, quality, sizePolicy, languageMode, additionalLanguages, namingMode, customNameByAsset, batchName]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(jobs.map((job) => job.id)));
  const [activeJobId, setActiveJobId] = useState(jobs[0]?.id);

  useEffect(() => {
    setSelectedIds(new Set(jobs.map((job) => job.id)));
    setActiveJobId(jobs[0]?.id);
  }, [jobs]);

  const activeJob = jobs.find((job) => job.id === activeJobId) ?? jobs[0];
  const activeAsset = activeJob ? assets.find((asset) => asset.id === activeJob.assetId) : undefined;
  const activeSpec = activeJob ? specs.find((spec) => spec.id === activeJob.specId) : undefined;
  const activePreviewState = activeJob?.previewSnapshot;

  const activeLayer = useMemo(() => {
    if (!activeJob) return brandLayer;
    return {
      ...brandLayer,
      logoEnabled: activeJob.brandSnapshot.logoEnabled ?? brandLayer.logoEnabled,
      logoEffect: activeJob.brandSnapshot.logoEffect ?? brandLayer.logoEffect,
      logoGroup: normalizeLogoGroup(activeJob.brandSnapshot.logo),
      cprState: activeJob.brandSnapshot.cpr,
      cprEnabled: activeJob.brandSnapshot.cpr.enabled
    };
  }, [activeJob, brandLayer]);

  const activeResolvedAssets = useMemo(() => {
    if (!activeJob) return undefined;
    return {
      gameLogo: activeJob.resolvedLogoAssetId ? brandAssets.find((asset) => asset.id === activeJob.resolvedLogoAssetId) : undefined,
      companyLogo: activeJob.resolvedCompanyLogoAssetId ? brandAssets.find((asset) => asset.id === activeJob.resolvedCompanyLogoAssetId) : undefined,
      cpr: activeJob.resolvedCprAssetId ? brandAssets.find((asset) => asset.id === activeJob.resolvedCprAssetId) : undefined
    };
  }, [activeJob, brandAssets]);

  const selectedJobs = jobs.filter((job) => selectedIds.has(job.id));
  const allSelected = jobs.length > 0 && selectedJobs.length === jobs.length;
  const hasMissingSelection = selectedJobs.some((job) => job.missing);

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

  function toggleJob(jobId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(jobs.map((job) => job.id)));
  }

  async function exportSelectedFiles() {
    if (!selectedJobs.length || exporting) return;
    const completed = await controller.run({
      jobs: selectedJobs,
      boardBrandStates,
      brandAssets,
      brandLayer,
      brandSettings,
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
              <span>{selectedJobs.length} / {jobs.length}</span>
            </div>
            <div className="export-file-list">
              {jobs.map((job) => {
                const overLimit = job.estimatedBytes > job.effectiveMaxSizeKb * 1024;
                return (
                  <div key={job.id} className={`export-file-row ${job.id === activeJob?.id ? 'active' : ''} ${job.missing ? 'is-missing' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(job.id)}
                      onChange={() => toggleJob(job.id)}
                      aria-label={`选择 ${job.plannedFileName}`}
                      disabled={job.missing}
                    />
                    <button type="button" onClick={() => setActiveJobId(job.id)}>
                      <strong>{job.plannedFileName}</strong>
                      <span>{job.specSnapshot.width} x {job.specSnapshot.height}</span>
                      <small className={overLimit ? 'size-warning' : ''}>
                        预计 {Math.round(job.estimatedBytes / 1024)} KB{overLimit ? format === 'jpg' ? ` · 超限，将压缩至 ${(job.effectiveMaxSizeKb / 1024).toFixed(job.effectiveMaxSizeKb % 1024 === 0 ? 0 : 1)}MB` : ' · PNG 超限' : ''}
                        {job.missing ? ` · ${job.missingReason}` : ''}
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
                  logoAsset={activeResolvedAssets?.gameLogo}
                  cprAsset={activeResolvedAssets?.cpr}
                  brandLayer={activeLayer}
                  overlayCompanyLogo={activeResolvedAssets?.companyLogo}
                  overlayGameLogo={activeResolvedAssets?.gameLogo}
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
              <span>命名模式</span>
              <select value={namingMode} onChange={(event) => setNamingMode(event.target.value as ExportNamingMode)}>
                <option value="source-name">源图片名</option>
                <option value="custom-name">自定义名称</option>
              </select>
            </label>
            {namingMode === 'custom-name' ? (
              <div className="export-field">
                <span>自定义名</span>
                <div className="custom-name-list">
                  {assets.map((asset) => (
                    <label key={asset.id} className="custom-name-row">
                      <small>{asset.fileName}</small>
                      <input
                        value={customNameByAsset[asset.id] ?? ''}
                        onChange={(event) => setCustomNameByAsset((previous) => ({ ...previous, [asset.id]: event.target.value }))}
                        placeholder="替代源图片名"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="export-field">
              <span>批次名（可选）</span>
              <input value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="不输则不加入文件名" />
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
            <label className="export-field"><span>体积策略</span><select value={sizePolicy.mode} onChange={(event) => setSizePolicy(event.target.value === 'unlimited' ? { mode: 'unlimited' } : event.target.value === 'custom' ? { mode: 'custom', maxSizeKb: DEFAULT_MAX_SIZE_KB } : { mode: 'default-limit', maxSizeKb: DEFAULT_MAX_SIZE_KB })}><option value="default-limit">规格 / 默认 8MB</option><option value="custom">自定义上限</option><option value="unlimited">不限制</option></select></label>
            {sizePolicy.mode === 'custom' ? <label className="export-field"><span>指定</span><div className="export-limit-input"><input aria-label="指定 MB" type="number" min="0.1" max="100" step="0.1" value={sizePolicy.maxSizeKb / 1024} onChange={(event) => setSizePolicy({ mode: 'custom', maxSizeKb: Math.round(Math.min(100, Math.max(0.1, Number(event.target.value) || 8)) * 1024) })} /><small>MB</small></div></label> : null}
            {format === 'jpg' ? <label className="toggle"><input type="checkbox" checked={autoCompressJpeg} onChange={(event) => setAutoCompressJpeg(event.target.checked)} />JPG 超限时自动压缩</label> : null}

            <div className="export-language-section">
              <span className="control-label">语种导出</span>
              <label className="radio"><input type="radio" name="language-mode" value="default" checked={languageMode === 'default'} onChange={() => setLanguageMode('default')} />每画板使用自身已保存语种</label>
              <label className="radio"><input type="radio" name="language-mode" value="append" checked={languageMode === 'append'} onChange={() => setLanguageMode('append')} />追加其他语种</label>
              <label className="radio"><input type="radio" name="language-mode" value="all" checked={languageMode === 'all'} onChange={() => setLanguageMode('all')} />全部语种分别导出</label>
            </div>
            {languageMode === 'append' ? (
              <div className="export-language-list">
                <div className="export-language-heading"><span>追加语种</span><span><button type="button" onClick={() => setAdditionalLanguages([...EXPORT_LANGUAGES])}>全选</button><button type="button" onClick={() => setAdditionalLanguages([])}>清空</button></span></div>
                {EXPORT_LANGUAGES.map((language) => <label key={language} className="toggle"><input type="checkbox" checked={additionalLanguages.includes(language)} onChange={(event) => setAdditionalLanguages((previous) => event.target.checked ? [...new Set([...previous, language])] : previous.filter((item) => item !== language))} />{getBrandLanguageLabel(language)}</label>)}
              </div>
            ) : null}

            <div className="export-summary-box">
              <span>已选 {selectedJobs.length} 个文件</span>
              {batchResult ? <div className="export-result-list" aria-live="polite">{batchResult.outcomes.map(({ item, outcome }) => {
              const job = item;
                const fileName = outcome.result === 'failed' ? job.plannedFileName : outcome.actualFileName ?? job.plannedFileName;
                return <span key={job.id} className={`export-result is-${outcome.result}`}>{fileName} · {outcome.result === 'failed' ? `失败：${outcome.reason}` : outcome.result === 'compressed' ? `已压缩 ${(outcome.outputBytes / (1024 * 1024)).toFixed(2)} MB` : `完成 ${(outcome.outputBytes / (1024 * 1024)).toFixed(2)} MB`}</span>;
              })}</div> : null}
            </div>
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
            <button type="button" className="primary-button" onClick={() => void exportSelectedFiles()} disabled={!selectedJobs.length || exporting || hasMissingSelection}>
              {exporting ? '正在导出...' : `导出 ${selectedJobs.length} 个文件`}
            </button>
          </div>
        </div>
      </section>
    </ExportDialog>
  );
}
