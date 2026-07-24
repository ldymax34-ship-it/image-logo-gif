import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHROMA_COLORS,
  createEmptyJob,
  DEFAULT_COMPRESSION,
  formatFileSize,
  formatSeconds,
  TARGET_FILE_BYTES,
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
  const [previewIndex, setPreviewIndex] = useState(0);
  const [taskStatus, setTaskStatus] = useState<BatchTaskStatus>('idle');
  const [results, setResults] = useState<TemplateResult[]>([]);
  const [message, setMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [jobJsonText, setJobJsonText] = useState('');
  const [showJobJson, setShowJobJson] = useState(false);
  const apiRef = useRef<any>(null);

  // ---- helpers ----
  const hasWork = job.templateFiles.length > 0 || job.singleVideoPath || job.videoSlots.length > 0;

  // ---- mode switch ----
  function requestModeSwitch(next: BatchTemplateGifMode) {
    if (mode === next) return;
    if (hasWork) { setPendingMode(next); setShowModeConfirm(true); return; }
    executeSwitch(next);
  }
  function executeSwitch(next: BatchTemplateGifMode) {
    setMode(next); setShowModeConfirm(false); setPendingMode(null);
    setJob(createEmptyJob()); setProbe(null); setResults([]);
  }

  // ---- file ops ----
  async function pickVideo() {
    if (!apiRef.current) return;
    const paths: string[] = await apiRef.current.pickMediaFiles?.() ?? [];
    if (!paths.length) return;
    setJob(prev => ({ ...prev, singleVideoPath: paths[0], singleVideoName: paths[0].split('/').pop() ?? paths[0] }));
    // probe
    try { setProbe(await apiRef.current.probeMedia(paths[0])); } catch {}
  }

  async function pickTemplateDir() {
    if (!apiRef.current) return;
    const dir: string | null = await apiRef.current.pickOutputDirectory?.() ?? null;
    if (!dir) return;
    // List PNG files in dir
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const entries = await readDir(dir);
      const pngs = entries.filter((e: any) => e.name?.toLowerCase().endsWith('.png')).map((e: any) => `${dir}/${e.name}`);
      setJob(prev => ({ ...prev, templateDir: dir, templateFiles: pngs }));
    } catch { setMessage('无法读取模板文件夹'); }
  }

  async function pickOutputDir() {
    if (!apiRef.current) return;
    const dir: string | null = await apiRef.current.pickOutputDirectory?.() ?? null;
    if (dir) setJob(prev => ({ ...prev, outputDir: dir }));
  }

  async function pickSlotVideo(slotId: string) {
    if (!apiRef.current) return;
    const paths: string[] = await apiRef.current.pickMediaFiles?.() ?? [];
    if (!paths.length) return;
    setJob(prev => ({
      ...prev,
      videoSlots: prev.videoSlots.map(s => s.id === slotId ? { ...s, videoPath: paths[0], videoName: paths[0].split('/').pop() ?? paths[0] } : s),
    }));
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

  // ---- timeline ----
  function setTimelineStart(v: number) { setJob(prev => ({ ...prev, startSeconds: Math.max(0, Math.min(v, prev.endSeconds - 0.1)) })); }
  function setTimelineEnd(v: number) { setJob(prev => ({ ...prev, endSeconds: Math.max(prev.startSeconds + 0.1, Math.min(v, prev.videoDuration)) })); }
  function resetTimeline() { setJob(prev => ({ ...prev, startSeconds: 0, endSeconds: prev.videoDuration })); }

  // ---- compression ----
  function setPref(p: CompressionPreference) { setJob(prev => ({ ...prev, compression: { ...prev.compression, preference: p } })); }

  // ---- batch run ----
  async function startBatch() {
    if (!apiRef.current || !desktop) return;
    setTaskStatus('running');
    setResults([]);
    setMessage('');

    const templates = job.templateFiles;
    const videos = job.mode === 'single-video-multi-template'
      ? [{ color: CHROMA_COLORS.green, path: job.singleVideoPath! }]
      : job.videoSlots.filter(s => s.videoPath).map(s => ({ color: s.color, path: s.videoPath }));

    // For now: placeholder - will implement full compositing later
    const out: TemplateResult[] = [];
    for (const tpl of templates) {
      const name = tpl.split('/').pop() ?? tpl;
      out.push({
        templatePath: tpl,
        templateName: name,
        outputPath: `${job.outputDir}/${name.replace('.png', '.gif')}`,
        outputBytes: 0,
        status: 'failed',
        error: '色键合成暂未实现（下一阶段开发）',
      });
    }

    setResults(out);
    setTaskStatus('done');
    setMessage('色键合成功能仍在开发中。当前已预留完整接口和批任务结构。');
  }

  // ---- job.json ----
  function generateJobJson() {
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

  // ---- render ----
  return (
    <div className="embedded-tool-wrapper">
      <header className="embedded-tool-topbar">
        <button type="button" className="embedded-tool-back" onClick={onReturn}>← 返回工具箱</button>
        <span className="embedded-tool-title">批量模板 GIF 合成器</span>
        <span className="embedded-tool-badge">内部实验</span>
      </header>

      <div className="btg-layout">
        {/* Mode tabs */}
        <nav className="btg-mode-tabs" role="tablist">
          <button role="tab" className={mode === 'single-video-multi-template' ? 'selected' : ''} onClick={() => requestModeSwitch('single-video-multi-template')}>单视频批量套模板</button>
          <button role="tab" className={mode === 'multi-video-multi-template' ? 'selected' : ''} onClick={() => requestModeSwitch('multi-video-multi-template')}>多视频映射批量合成</button>
        </nav>

        <div className="btg-main">
          {/* Left: inputs + template list */}
          <section className="btg-inputs">
            {/* Single video mode */}
            {mode === 'single-video-multi-template' && (
              <div className="btg-section">
                <div className="btg-section-header"><h3>源视频</h3></div>
                <button className="btg-pick-btn" onClick={pickVideo} disabled={!desktop}>
                  {job.singleVideoName || '选择 MP4 / MOV'}
                </button>
                {probe && <span className="btg-info">{probe.width}×{probe.height} · {probe.fps.toFixed(1)}fps · {formatSeconds(probe.duration)}</span>}
              </div>
            )}

            {/* Multi video mode: color slot mapping */}
            {mode === 'multi-video-multi-template' && (
              <div className="btg-section">
                <div className="btg-section-header"><h3>占位颜色映射</h3><button className="btg-add-slot" onClick={addColorSlot}>+ 添加槽位</button></div>
                {job.videoSlots.length === 0 && <p className="btg-hint">添加颜色槽位，映射到对应视频。模板中的纯色区域会被替换为视频。</p>}
                {job.videoSlots.map(slot => (
                  <div key={slot.id} className={`btg-slot ${selectedSlotId === slot.id ? 'selected' : ''}`} onClick={() => setSelectedSlotId(slot.id)}>
                    <select value={slot.color} onChange={e => updateSlot(slot.id, { color: e.target.value })} className="btg-color-select">
                      {CHROMA_MODES.map(m => <option key={m} value={CHROMA_COLORS[m]}>{m === 'custom' ? '自定义' : m}</option>)}
                    </select>
                    <span className="btg-color-swatch" style={{ background: slot.color }} />
                    <button className="btg-pick-btn btg-slot-video" onClick={(e) => { e.stopPropagation(); pickSlotVideo(slot.id); }}>
                      {slot.videoName || '选择视频'}
                    </button>
                    <button className="btg-remove-slot" onClick={(e) => { e.stopPropagation(); removeSlot(slot.id); }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Template dir */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>模板文件夹</h3></div>
              <button className="btg-pick-btn" onClick={pickTemplateDir} disabled={!desktop}>
                {job.templateDir || '选择模板 PNG 文件夹'}
              </button>
              {job.templateFiles.length > 0 && <span className="btg-info">{job.templateFiles.length} 张模板</span>}
            </div>

            {/* Output dir */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>输出目录</h3></div>
              <button className="btg-pick-btn" onClick={pickOutputDir} disabled={!desktop}>
                {job.outputDir || '选择输出文件夹'}
              </button>
            </div>

            {/* Timeline */}
            {probe && (
              <div className="btg-section">
                <div className="btg-section-header"><h3>截取区间</h3></div>
                <div className="btg-timeline-row">
                  <label>开始 <input type="number" value={job.startSeconds} min={0} max={job.endSeconds - 0.1} step={0.1} onChange={e => setTimelineStart(Number(e.target.value))} className="btg-time-input" /></label>
                  <label>结束 <input type="number" value={job.endSeconds} min={job.startSeconds + 0.1} max={job.videoDuration} step={0.1} onChange={e => setTimelineEnd(Number(e.target.value))} className="btg-time-input" /></label>
                  <button className="btg-reset-btn" onClick={resetTimeline}>恢复完整时长</button>
                  <span className="btg-info">选中：{formatSeconds(job.endSeconds - job.startSeconds)}</span>
                </div>
              </div>
            )}
          </section>

          {/* Right: preview + params */}
          <aside className="btg-sidebar">
            {/* Template preview */}
            {job.templateFiles.length > 0 && (
              <div className="btg-section">
                <div className="btg-section-header"><h3>模板预览</h3></div>
                <div className="btg-preview-nav">
                  <button disabled={previewIndex === 0} onClick={() => setPreviewIndex(i => i - 1)}>◂ 上一张</button>
                  <span>{previewIndex + 1} / {job.templateFiles.length}</span>
                  <button disabled={previewIndex >= job.templateFiles.length - 1} onClick={() => setPreviewIndex(i => i + 1)}>下一张 ▸</button>
                </div>
                <div className="btg-preview-img">
                  {job.templateFiles[previewIndex] && (
                    <img src={`asset://localhost/${encodeURIComponent(job.templateFiles[previewIndex])}`} alt={job.templateFiles[previewIndex].split('/').pop()} />
                  )}
                </div>
              </div>
            )}

            {/* Fit mode */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>视频适配</h3></div>
              <div className="btg-fit-btns">
                {(Object.keys(FIT_LABELS) as VideoFitMode[]).map(f => (
                  <button key={f} className={job.fitMode === f ? 'selected' : ''} onClick={() => setJob(prev => ({ ...prev, fitMode: f }))}>{FIT_LABELS[f]}</button>
                ))}
              </div>
              {selectedSlotId && (
                <div className="btg-video-adjust">
                  <div className="btg-section-header" style={{ marginTop: 8 }}><h4>视频微调</h4></div>
                  <label>缩放 <input type="range" min={0.5} max={2} step={0.01} value={job.videoSlots.find(s => s.id === selectedSlotId)?.scale ?? 1} onChange={e => updateSlot(selectedSlotId, { scale: Number(e.target.value) })} /></label>
                  <div className="btg-offset-row">
                    <label>X <input type="number" value={job.videoSlots.find(s => s.id === selectedSlotId)?.offsetX ?? 0} onChange={e => updateSlot(selectedSlotId, { offsetX: Number(e.target.value) })} className="btg-offset-input" /></label>
                    <label>Y <input type="number" value={job.videoSlots.find(s => s.id === selectedSlotId)?.offsetY ?? 0} onChange={e => updateSlot(selectedSlotId, { offsetY: Number(e.target.value) })} className="btg-offset-input" /></label>
                    <button onClick={() => updateSlot(selectedSlotId, { offsetX: 0, offsetY: 0, scale: 1 })}>重置</button>
                  </div>
                </div>
              )}
            </div>

            {/* Compression */}
            <div className="btg-section">
              <div className="btg-section-header"><h3>压缩策略</h3></div>
              <div className="btg-fit-btns">
                {(Object.keys(PREF_LABELS) as CompressionPreference[]).map(p => (
                  <button key={p} className={job.compression.preference === p ? 'selected' : ''} onClick={() => setPref(p)}>{PREF_LABELS[p]}</button>
                ))}
              </div>
              <button className="btg-advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>{showAdvanced ? '▾' : '▸'} 高级选项</button>
              {showAdvanced && (
                <div className="btg-advanced">
                  <label>最低宽度 <input type="number" value={job.compression.minWidth ?? ''} placeholder="不限制" onChange={e => setJob(prev => ({ ...prev, compression: { ...prev.compression, minWidth: e.target.value ? Number(e.target.value) : undefined } }))} className="btg-offset-input" /></label>
                  <label>最低帧率 <input type="number" value={job.compression.minFps ?? ''} placeholder="不限制" onChange={e => setJob(prev => ({ ...prev, compression: { ...prev.compression, minFps: e.target.value ? Number(e.target.value) : undefined } }))} className="btg-offset-input" /></label>
                  <label className="btg-checkbox"><input type="checkbox" checked={job.compression.allowStrongCompression} onChange={e => setJob(prev => ({ ...prev, compression: { ...prev.compression, allowStrongCompression: e.target.checked } }))} /> 允许强压缩</label>
                </div>
              )}
              <p className="btg-hint">所有输出严格小于 8MB，超限自动重试。</p>
            </div>

            {/* Engine status */}
            <div className={`btg-engine-status ${engine.ready ? 'ready' : ''}`}>
              <strong>{engine.ready ? '引擎已就绪' : '引擎状态'}</strong>
              <span>{engine.message}</span>
            </div>

            {/* Actions */}
            {message && <p className="btg-message">{message}</p>}
            <button className="btg-run" disabled={!desktop || !engine.ready || taskStatus === 'running' || job.templateFiles.length === 0} onClick={startBatch}>
              {taskStatus === 'running' ? '处理中…' : '开始批量合成'}
            </button>
            <button className="btg-job-json" onClick={generateJobJson}>生成 job.json</button>

            {/* Results */}
            {results.length > 0 && (
              <div className="btg-section">
                <div className="btg-section-header"><h3>结果</h3></div>
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
