import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHROMA_COLORS,
  createEmptyJob,
  DEFAULT_COMPRESSION,
  formatFileSize,
  formatSeconds,
  type BatchTaskStatus,
  type BatchTemplateGifJob,
  type BatchTemplateGifMode,
  type ChromaKeyMode,
  type CompressionPreference,
  type MediaEngineStatus,
  type MediaProbeResult,
  type TemplateResult,
  type TemplateVideoSlot,
  type VideoFitMode,
} from './types';

type Props = { onReturn: () => void };

const FIT_LABELS: Record<VideoFitMode, string> = { cover: '填满区域', contain: '完整显示' };
const PREF_LABELS: Record<CompressionPreference, string> = { balanced: '均衡', clarity: '优先清晰', smoothness: '优先流畅' };
const CHROMA_MODES: ChromaKeyMode[] = ['green', 'blue', 'red', 'custom'];

export function BatchTemplateGif({ onReturn }: Props) {
  // ---- state ----
  const [desktop, setDesktop] = useState(false);
  const [engine, setEngine] = useState<MediaEngineStatus>({ ready: false, message: '检查引擎…' });
  const [job, setJob] = useState<BatchTemplateGifJob>(createEmptyJob);
  const [mode, setMode] = useState<BatchTemplateGifMode>('single-video-multi-template');
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [pendingMode, setPendingMode] = useState<BatchTemplateGifMode | null>(null);
  const [probe, setProbe] = useState<MediaProbeResult | null>(null);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [taskStatus, setTaskStatus] = useState<BatchTaskStatus>('idle');
  const [results, setResults] = useState<TemplateResult[]>([]);
  const [message, setMessage] = useState('');

  // ---- preview state ----
  const [previewPath, setPreviewPath] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ---- video adjust ----
  const [videoScale, setVideoScale] = useState(1);
  const [videoOffsetX, setVideoOffsetX] = useState(0);
  const [videoOffsetY, setVideoOffsetY] = useState(0);

  // ---- job.json ----
  const [jobJsonText, setJobJsonText] = useState('');
  const [showJobJson, setShowJobJson] = useState(false);

  const apiRef = useRef<any>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ---- helpers ----
  const hasWork = job.templateFiles.length > 0 || job.singleVideoPath || job.videoSlots.length > 0;
  const currentTemplate = job.templateFiles[templateIndex];

  // ---- mode switch ----
  function requestModeSwitch(next: BatchTemplateGifMode) {
    if (mode === next) return;
    if (hasWork) { setPendingMode(next); setShowModeConfirm(true); return; }
    executeSwitch(next);
  }
  function executeSwitch(next: BatchTemplateGifMode) {
    setMode(next); setShowModeConfirm(false); setPendingMode(null);
    setJob(createEmptyJob()); setProbe(null); setResults([]);
    setPreviewPath(''); setHasPreviewed(false);
  }

  // ---- file ops ----
  async function pickVideo() {
    if (!apiRef.current) return;
    const paths: string[] = await apiRef.current.pickMediaFiles?.() ?? [];
    if (!paths.length) return;
    setJob(prev => ({ ...prev, singleVideoPath: paths[0], singleVideoName: paths[0].split('/').pop() ?? paths[0] }));
    setHasPreviewed(false); setPreviewPath('');
    try { setProbe(await apiRef.current.probeMedia(paths[0])); } catch {}
  }

  async function pickTemplateDir() {
    if (!apiRef.current) return;
    const dir: string | null = await apiRef.current.pickOutputDirectory?.() ?? null;
    if (!dir) return;
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const entries = await readDir(dir);
      const pngs = entries.filter((e: any) => e.name?.toLowerCase().endsWith('.png')).map((e: any) => `${dir}/${e.name}`);
      setJob(prev => ({ ...prev, templateDir: dir, templateFiles: pngs }));
      setTemplateIndex(0);
      setHasPreviewed(false); setPreviewPath('');
    } catch { setMessage('无法读取模板文件夹'); }
  }

  async function pickOutputDir() {
    if (!apiRef.current) return;
    const dir: string | null = await apiRef.current.pickOutputDirectory?.() ?? null;
    if (dir) setJob(prev => ({ ...prev, outputDir: dir }));
  }

  // ---- multi-video slot ops ----
  async function pickSlotVideo(slotId: string) {
    if (!apiRef.current) return;
    const paths: string[] = await apiRef.current.pickMediaFiles?.() ?? [];
    if (!paths.length) return;
    setJob(prev => ({
      ...prev,
      videoSlots: prev.videoSlots.map(s => s.id === slotId ? { ...s, videoPath: paths[0], videoName: paths[0].split('/').pop() ?? paths[0] } : s),
    }));
    setHasPreviewed(false); setPreviewPath('');
  }

  function addColorSlot() {
    const slot: TemplateVideoSlot = { id: `slot-${Date.now()}`, color: CHROMA_COLORS.green, videoPath: '', videoName: '' };
    setJob(prev => ({ ...prev, videoSlots: [...prev.videoSlots, slot] }));
  }

  function removeSlot(slotId: string) {
    setJob(prev => ({ ...prev, videoSlots: prev.videoSlots.filter(s => s.id !== slotId) }));
  }

  function updateSlot(slotId: string, patch: Partial<TemplateVideoSlot>) {
    setJob(prev => ({ ...prev, videoSlots: prev.videoSlots.map(s => s.id === slotId ? { ...s, ...patch } : s) }));
  }

  // ---- video position ----
  const activeVideoPath = mode === 'single-video-multi-template' ? job.singleVideoPath : job.videoSlots[0]?.videoPath;
  const activeColor = mode === 'single-video-multi-template' ? CHROMA_COLORS.green : (job.videoSlots[0]?.color ?? CHROMA_COLORS.green);

  // ---- preview ----
  async function generatePreview() {
    if (!desktop || !currentTemplate || !activeVideoPath || !job.outputDir) {
      setMessage('请先选择模板、视频和输出目录');
      return;
    }
    setPreviewLoading(true); setMessage('');
    const tempDir = `${job.outputDir}/.preview`;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const outPath = `${tempDir}/preview_${Date.now()}.png`;
      const result: string = await invoke('preview_template_frame', {
        templatePath: currentTemplate,
        videoPath: activeVideoPath,
        outputPath: outPath,
        timestampSeconds: job.startSeconds,
        colorHex: activeColor,
        fitMode: job.fitMode,
      });
      setPreviewPath(`asset://localhost/${encodeURIComponent(result)}`);
      setHasPreviewed(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '预览生成失败');
    } finally {
      setPreviewLoading(false);
    }
  }

  function debouncePreview() {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => generatePreview(), 400);
  }

  // ---- timeline ----
  function setTLStart(v: number) { setJob(prev => ({ ...prev, startSeconds: Math.max(0, Math.min(v, prev.endSeconds - 0.1)) })); debouncePreview(); }
  function setTLEnd(v: number) { setJob(prev => ({ ...prev, endSeconds: Math.max(prev.startSeconds + 0.1, Math.min(v, prev.videoDuration)) })); debouncePreview(); }
  function resetTL() { setJob(prev => ({ ...prev, startSeconds: 0, endSeconds: prev.videoDuration })); }

  // ---- compression ----
  function setPref(p: CompressionPreference) { setJob(prev => ({ ...prev, compression: { ...prev.compression, preference: p } })); }

  // ---- batch run ----
  async function startBatch() {
    if (!apiRef.current || !desktop) return;
    setTaskStatus('running'); setResults([]); setMessage('');

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ results: TemplateResult[] }>('compose_batch_template_gifs', {
        request: {
          mode: job.mode,
          templatePaths: job.templateFiles,
          outputDirectory: job.outputDir,
          startSeconds: job.startSeconds,
          endSeconds: job.endSeconds,
          fitMode: job.fitMode,
          fps: 24,
          width: undefined,
          compressionPreference: job.compression.preference,
          targetBytes: job.compression.targetBytes,
          minWidth: job.compression.minWidth,
          minFps: job.compression.minFps,
          allowStrongCompression: job.compression.allowStrongCompression,
          singleVideoPath: job.singleVideoPath ?? undefined,
          videoSlots: job.videoSlots.filter(s => s.videoPath).map(s => ({ color: s.color, videoPath: s.videoPath })),
        }
      });
      setResults(result.results);
      const ok = result.results.filter(r => r.status === 'success').length;
      const total = result.results.length;
      setMessage(`完成：${ok}/${total} 个模板成功`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setTaskStatus('done');
    }
  }

  // ---- job.json ----
  async function saveJobJson() {
    const json = JSON.stringify({
      mode: job.mode,
      templatesDir: job.templateDir,
      outputDir: job.outputDir,
      singleVideoPath: job.singleVideoPath,
      videoSlots: job.videoSlots,
      startSeconds: job.startSeconds,
      endSeconds: job.endSeconds,
      fitMode: job.fitMode,
      compression: job.compression,
    }, null, 2);
    setJobJsonText(json);
    setShowJobJson(true);

    if (desktop && job.outputDir) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_batch_job_json', { directory: job.outputDir, jobJson: json });
      } catch {}
    }
  }

  // ---- init ----
  useEffect(() => {
    async function init() {
      try {
        const mod = await import('../gif-media/mediaDesktop');
        if (!mod.isMediaDesktopAvailable()) return;
        setDesktop(true);
        apiRef.current = await mod.loadMediaDesktopApi();
        setEngine(await apiRef.current.getEngineStatus());
      } catch {}
    }
    init();
  }, []);

  useEffect(() => () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); }, []);

  // ---- render ----
  return (
    <div className="embedded-tool-wrapper">
      <header className="embedded-tool-topbar">
        <button className="embedded-tool-back" onClick={onReturn}>← 返回工具箱</button>
        <span className="embedded-tool-title">批量模板 GIF 合成器</span>
        <span className="embedded-tool-badge">内部实验</span>
      </header>

      <div className="btg-layout">
        {/* Mode tabs */}
        <nav className="btg-mode-tabs">
          <button className={mode === 'single-video-multi-template' ? 'selected' : ''} onClick={() => requestModeSwitch('single-video-multi-template')}>单视频批量套模板</button>
          <button className={mode === 'multi-video-multi-template' ? 'selected' : ''} onClick={() => requestModeSwitch('multi-video-multi-template')}>多视频映射批量合成</button>
        </nav>

        <div className="btg-body">
          {/* CENTER: Preview canvas */}
          <section className="btg-preview-area">
            {currentTemplate ? (
              <>
                <div className="btg-preview-header">
                  <span>模板预览</span>
                  <div className="btg-preview-nav">
                    <button disabled={templateIndex === 0} onClick={() => { setTemplateIndex(i => i - 1); setHasPreviewed(false); setPreviewPath(''); }}>◂</button>
                    <span>{templateIndex + 1} / {job.templateFiles.length}</span>
                    <button disabled={templateIndex >= job.templateFiles.length - 1} onClick={() => { setTemplateIndex(i => i + 1); setHasPreviewed(false); setPreviewPath(''); }}>▸</button>
                  </div>
                  <span className="btg-template-name">{currentTemplate.split('/').pop()}</span>
                </div>
                <div className="btg-canvas">
                  {previewPath ? (
                    <img src={previewPath} alt="合成预览" className="btg-canvas-img" />
                  ) : (
                    <div className="btg-canvas-empty">
                      {currentTemplate ? (
                        <>
                          <img src={`asset://localhost/${encodeURIComponent(currentTemplate)}`} alt="模板" className="btg-canvas-template-only" />
                          <div className="btg-canvas-overlay-hint">点击「预览效果」查看合成结果</div>
                        </>
                      ) : (
                        <span>等待导入模板和视频</span>
                      )}
                    </div>
                  )}
                  {previewLoading && <div className="btg-canvas-loading">生成预览中…</div>}
                </div>
              </>
            ) : (
              <div className="btg-canvas-empty">
                <span>导入模板文件夹和视频后，在此预览合成效果</span>
              </div>
            )}

            {/* Template list at bottom */}
            {job.templateFiles.length > 0 && (
              <div className="btg-template-strip">
                <span className="btg-strip-label">模板列表</span>
                <div className="btg-template-thumbs">
                  {job.templateFiles.map((tpl, i) => (
                    <button
                      key={tpl}
                      className={`btg-thumb ${i === templateIndex ? 'active' : ''}`}
                      onClick={() => { setTemplateIndex(i); setHasPreviewed(false); setPreviewPath(''); }}
                      title={tpl.split('/').pop()}
                    >
                      <img src={`asset://localhost/${encodeURIComponent(tpl)}`} alt="" />
                      <span>{tpl.split('/').pop()?.replace('.png', '')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* RIGHT: Parameters */}
          <aside className="btg-sidebar">
            {/* Video input */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>视频</h3></div>
              {mode === 'single-video-multi-template' ? (
                <button className="btg-pick-btn" onClick={pickVideo} disabled={!desktop}>
                  {job.singleVideoName || '选择 MP4 / MOV'}
                </button>
              ) : (
                <>
                  {job.videoSlots.map(slot => (
                    <div key={slot.id} className="btg-slot-row">
                      <span className="btg-color-dot" style={{ background: slot.color }} />
                      <button className="btg-pick-btn btg-slot-pick" onClick={() => pickSlotVideo(slot.id)}>
                        {slot.videoName || `选择视频 (${slot.color})`}
                      </button>
                      <button className="btg-remove-slot" onClick={() => removeSlot(slot.id)}>×</button>
                    </div>
                  ))}
                  <button className="btg-add-slot-link" onClick={addColorSlot}>+ 添加颜色槽位</button>
                </>
              )}
              {probe && <span className="btg-info">{probe.width}×{probe.height} · {probe.fps.toFixed(1)}fps · {formatSeconds(probe.duration)}</span>}
            </div>

            {/* Template folder */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>模板文件夹</h3></div>
              <button className="btg-pick-btn" onClick={pickTemplateDir} disabled={!desktop}>
                {job.templateDir ? `${job.templateFiles.length} 张模板` : '选择模板 PNG 文件夹'}
              </button>
            </div>

            {/* Fit mode */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>适配方式</h3></div>
              <div className="btg-fit-btns">
                {(Object.keys(FIT_LABELS) as VideoFitMode[]).map(f => (
                  <button key={f} className={job.fitMode === f ? 'selected' : ''} onClick={() => { setJob(prev => ({ ...prev, fitMode: f })); debouncePreview(); }}>
                    {FIT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>

            {/* Video adjust */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>视频微调</h3></div>
              <div className="btg-adjust-grid">
                <label>缩放 <input type="range" min={0.5} max={2} step={0.01} value={videoScale} onChange={e => { setVideoScale(Number(e.target.value)); debouncePreview(); }} /></label>
                <div className="btg-offset-row">
                  <label>X <input type="number" value={videoOffsetX} onChange={e => { setVideoOffsetX(Number(e.target.value)); debouncePreview(); }} className="btg-offset-input" /></label>
                  <label>Y <input type="number" value={videoOffsetY} onChange={e => { setVideoOffsetY(Number(e.target.value)); debouncePreview(); }} className="btg-offset-input" /></label>
                </div>
                <div className="btg-adjust-actions">
                  <button onClick={() => { setVideoOffsetX(0); setVideoOffsetY(0); debouncePreview(); }}>居中</button>
                  <button onClick={() => { setVideoScale(1); setVideoOffsetX(0); setVideoOffsetY(0); debouncePreview(); }}>重置</button>
                </div>
              </div>
            </div>

            {/* Timeline */}
            {probe && (
              <div className="btg-section">
                <div className="btg-section-header"><h3>截取区间</h3></div>
                <div className="btg-timeline-row">
                  <label>开始 <input type="number" value={job.startSeconds} min={0} max={job.endSeconds - 0.1} step={0.1} onChange={e => setTLStart(Number(e.target.value))} className="btg-time-input" /></label>
                  <label>结束 <input type="number" value={job.endSeconds} min={job.startSeconds + 0.1} max={job.videoDuration} step={0.1} onChange={e => setTLEnd(Number(e.target.value))} className="btg-time-input" /></label>
                </div>
                <div className="btg-timeline-actions">
                  <button onClick={resetTL}>恢复完整时长</button>
                  <span className="btg-info">选中 {formatSeconds(job.endSeconds - job.startSeconds)}</span>
                </div>
              </div>
            )}

            {/* Output dir */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>输出目录</h3></div>
              <button className="btg-pick-btn" onClick={pickOutputDir} disabled={!desktop}>
                {job.outputDir || '选择输出文件夹'}
              </button>
            </div>

            {/* Compression */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>压缩策略</h3></div>
              <div className="btg-fit-btns">
                {(Object.keys(PREF_LABELS) as CompressionPreference[]).map(p => (
                  <button key={p} className={job.compression.preference === p ? 'selected' : ''} onClick={() => setPref(p)}>
                    {PREF_LABELS[p].slice(0, 2)}
                  </button>
                ))}
              </div>
              <span className="btg-compress-hint">{PREF_LABELS[job.compression.preference]}</span>
              <button className="btg-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>{showAdvanced ? '▾' : '▸'} 高级</button>
              {showAdvanced && (
                <div className="btg-advanced">
                  <label>最低宽度 <input type="number" value={job.compression.minWidth ?? ''} placeholder="不限" onChange={e => setJob(prev => ({ ...prev, compression: { ...prev.compression, minWidth: e.target.value ? Number(e.target.value) : undefined } }))} className="btg-offset-input" /></label>
                  <label>最低帧率 <input type="number" value={job.compression.minFps ?? ''} placeholder="不限" onChange={e => setJob(prev => ({ ...prev, compression: { ...prev.compression, minFps: e.target.value ? Number(e.target.value) : undefined } }))} className="btg-offset-input" /></label>
                  <label className="btg-checkbox"><input type="checkbox" checked={job.compression.allowStrongCompression} onChange={e => setJob(prev => ({ ...prev, compression: { ...prev.compression, allowStrongCompression: e.target.checked } }))} /> 允许强压缩</label>
                </div>
              )}
            </div>

            {/* Engine */}
            <div className={`btg-engine-status ${engine.ready ? 'ready' : ''}`}>
              <strong>{engine.ready ? '引擎已就绪' : '引擎状态'}</strong>
              <span>{engine.message}</span>
            </div>

            {message && <p className="btg-message">{message}</p>}

            {/* Actions */}
            <button className="btg-preview-btn" disabled={!desktop || !currentTemplate || !activeVideoPath || !job.outputDir || previewLoading} onClick={generatePreview}>
              {previewLoading ? '生成中…' : hasPreviewed ? '重新预览' : '预览效果'}
            </button>

            <button className="btg-run" disabled={!desktop || !engine.ready || taskStatus === 'running' || job.templateFiles.length === 0 || !activeVideoPath || !hasPreviewed} onClick={startBatch}>
              {taskStatus === 'running' ? '批量处理中…' : '开始批量合成'}
            </button>
            {!hasPreviewed && job.templateFiles.length > 0 && (
              <p className="btg-hint">请先点击「预览效果」确认合成结果后再批量输出</p>
            )}

            <button className="btg-job-json" onClick={saveJobJson}>保存 job.json</button>

            {/* Results */}
            {results.length > 0 && (
              <div className="btg-section">
                <div className="btg-section-header"><h3>结果 ({results.filter(r => r.status === 'success').length}/{results.length})</h3></div>
                <div className="btg-results">
                  {results.map((r, i) => (
                    <div key={i} className={`btg-result ${r.status}`}>
                      <span>{r.templateName}</span>
                      <span>{r.status === 'success' ? formatFileSize(r.outputBytes) : r.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Mode switch confirm */}
      {showModeConfirm && (
        <div className="btg-modal-overlay" onClick={() => setShowModeConfirm(false)}>
          <div className="btg-confirm">
            <p><strong>切换模式后，当前导入文件和设置将被清空。</strong></p>
            <div className="btg-confirm-actions">
              <button onClick={() => setShowModeConfirm(false)}>取消</button>
              <button onClick={() => pendingMode && executeSwitch(pendingMode)}>清空并切换</button>
            </div>
          </div>
        </div>
      )}

      {/* job.json modal */}
      {showJobJson && (
        <div className="btg-modal-overlay" onClick={() => setShowJobJson(false)}>
          <div className="btg-json-modal" onClick={e => e.stopPropagation()}>
            <h3>job.json</h3>
            <textarea readOnly value={jobJsonText} rows={20} />
            <div className="btg-confirm-actions">
              <button onClick={async () => { await navigator.clipboard.writeText(jobJsonText); }}>复制</button>
              <button onClick={() => setShowJobJson(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
