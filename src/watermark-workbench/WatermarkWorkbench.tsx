import { useCallback, useEffect, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricImage, FabricObject } from 'fabric';
import { ToolPageHeader } from '../components';
import { FABRIC_CANVAS_OPTIONS } from '../components/canvas/fabricSelection';
import { createFabricCanvasElement, disposeFabricCanvasHost, ignoreFabricDisposal } from '../components/canvas/fabricHost';
import { ConfirmationDialog } from '../modules/media-workbench/ConfirmationDialog';
import { logDiagnostic } from '../diagnostics/client';
import { classifyWatermarkPreview, loadWatermarkPreview } from './watermarkPreview';

/* ── types ── */
type WatermarkKind = 'text' | 'image';
type WatermarkPattern = 'single' | 'tiled' | 'diagonal';

type WatermarkState = {
  kind: WatermarkKind; text: string; imagePath?: string;
  pattern: WatermarkPattern; density: 'low' | 'medium' | 'high';
  x: number; y: number; scale: number; rotation: number;
  fontFamily: string; color: string;
  opacity: number; strokeEnabled: boolean; strokeColor: string; strokeWidth: number;
  shadowEnabled: boolean; shadowColor: string; shadowBlur: number;
  shadowOffsetX: number; shadowOffsetY: number;
  darkMode: boolean; outputDirectory: string;
};

type WatermarkTask = {
  id: string; path: string; name: string;
  status: 'waiting'|'running'|'success'|'failed'|'cancelled';
  progress: number; outputPath?: string; outputBytes?: number; error?: string;
};

const DEFAULT_STATE: WatermarkState = {
  kind: 'text', text: '品宣物料工作台', pattern: 'diagonal', density: 'medium',
  x: 0, y: 0, scale: 1, rotation: 45,
  fontFamily: 'Source Han Sans SC', color: '#ffffff',
  opacity: 0.50, strokeEnabled: false, strokeColor: '#000000', strokeWidth: 1,
  shadowEnabled: false, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 2,
  darkMode: false, outputDirectory: '',
};

function fmtSize(b?: number): string {
  if (!b || b < 0) return ''; if (b < 1048576) return `${Math.max(1,Math.round(b/1024))} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

/* ── component ── */
export function WatermarkWorkbench({ onReturn }: { onReturn: () => void }) {
  const [desktop, setDesktop] = useState(false);
  const [desktopState, setDesktopState] = useState<'initializing' | 'ready' | 'unavailable' | 'failed'>('initializing');
  const [tasks, setTasks] = useState<WatermarkTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [state, setState] = useState<WatermarkState>(DEFAULT_STATE);
  const [message, setMessage] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [previewNotice, setPreviewNotice] = useState('');
  const [backgroundPreviewError, setBackgroundPreviewError] = useState('');
  const [overlayError, setOverlayError] = useState('');
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [fabricReady, setFabricReady] = useState(false);
  const pendingReturnRef = useRef(false);

  /* ── lifecycle guards ── */
  const mountedRef = useRef(true);
  const initGenRef = useRef(0);
  const imageGenRef = useRef(0);
  const watermarkGenRef = useRef(0);
  const hostEpochRef = useRef(0);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  // React clears callback/object refs before passive effect cleanup. Keep the
  // host captured by the active Fabric instance so cleanup can still dispose
  // it after the React ref is null.
  const activeFabricHostRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const wmObjRef = useRef<FabricObject | null>(null);
  const apiRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const queueTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const activeTaskIdRef = useRef<string>();
  const stateRef = useRef(state);
  stateRef.current = state;
  activeTaskIdRef.current = activeTaskId;
  const unlistenRef = useRef<(() => void)|null>(null);

  const currentFile = tasks[0]?.path;

  function nextGen(ref: { current: number }) { ref.current += 1; return ref.current; }
  function isStale(ref: { current: number }, gen: number) { return !mountedRef.current || ref.current !== gen; }

  /* ── cleanup (run first in unmount) ── */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      initGenRef.current += 1;
      imageGenRef.current += 1;
      watermarkGenRef.current += 1;
      if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
      unlistenRef.current?.();
      // disconnect observer
      roRef.current?.disconnect();
      roRef.current = null;
      // dispose fabric
      const fc = fabricRef.current;
      const hostEpoch = hostEpochRef.current;
      if (fc) {
        try { fc.off('object:modified'); } catch {}
        try { fc.off('object:moving'); } catch {}
        try { fc.off('object:scaling'); } catch {}
        try { fc.off('object:rotating'); } catch {}
        fabricRef.current = null;
        const host = activeFabricHostRef.current;
        activeFabricHostRef.current = null;
        if (host) disposeFabricCanvasHost(host, () => fc.dispose(), () => hostEpochRef.current === hostEpoch && fabricRef.current !== fc);
      }
      wmObjRef.current = null;
    };
  }, []);

  /* ── init fabric ── */
  const initFabric = useCallback(async () => {
    const gen = nextGen(initGenRef);
    const { Canvas } = await import('fabric');
    if (isStale(initGenRef, gen) || !canvasHostRef.current || fabricRef.current) return;

    const canvasHost = canvasHostRef.current;
    const hostEpoch = ++hostEpochRef.current;
    const canvas = createFabricCanvasElement(canvasHost);

    const fc = new Canvas(canvas, {
      ...FABRIC_CANVAS_OPTIONS, selection: true, preserveObjectStacking: true,
      width: canvasHost.clientWidth || 800,
      height: canvasHost.clientHeight || 600,
    });
    if (isStale(initGenRef, gen)) {
      disposeFabricCanvasHost(canvasHost, () => fc.dispose(), () => hostEpochRef.current === hostEpoch && (isStale(initGenRef, gen) || fabricRef.current !== fc));
      return;
    }
    fabricRef.current = fc;
    activeFabricHostRef.current = canvasHost;
    setFabricReady(true);

    // ResizeObserver
    if (canvasHost) {
      const ro = new ResizeObserver(() => {
        if (!mountedRef.current || fabricRef.current !== fc) return;
        try {
          fabricRef.current.setDimensions({
            width: canvasHost.clientWidth,
            height: canvasHost.clientHeight,
          });
          fabricRef.current.renderAll();
        } catch {}
      });
      ro.observe(canvasHost);
      roRef.current = ro;
    }

    // canvas → state sync
    const sync = () => {
      if (!mountedRef.current) return;
      const obj = wmObjRef.current;
      if (!obj) return;
      setState(prev => ({
        ...prev,
        x: Math.round((obj.left ?? prev.x) * 10) / 10,
        y: Math.round((obj.top ?? prev.y) * 10) / 10,
        scale: Math.round(((obj.scaleX ?? prev.scale)+(obj.scaleY ?? prev.scale))/2*100)/100,
        rotation: Math.round(obj.angle ?? prev.rotation),
        opacity: Math.round((obj.opacity ?? prev.opacity)*100)/100,
      }));
    };
    fc.on('object:modified', sync);
    fc.on('object:moving', sync);
    fc.on('object:scaling', sync);
    fc.on('object:rotating', sync);
  }, []);

  /* ── desktop bridge ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { isMediaDesktopAvailable, loadMediaDesktopApi } = await import('../gif-media/mediaDesktop');
        if (!isMediaDesktopAvailable()) {
          if (!cancelled && mountedRef.current) {
            setDesktopState('unavailable');
            setMessage('真实水印处理仅在桌面应用中可用。');
          }
          return;
        }
        const api = await loadMediaDesktopApi();
        if (cancelled || !mountedRef.current) return;
        apiRef.current = api;
        setDesktop(true);
        setDesktopState('ready');
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          setDesktopState('failed');
          setMessage(error instanceof Error ? `桌面环境初始化失败：${error.message}` : '桌面环境初始化失败。');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── load image ── */
  const loadImage = useCallback(async (path: string) => {
    const gen = nextGen(imageGenRef);
    const fc = fabricRef.current;
    if (!fc) return;
    // A new selected input owns the canvas. Clear first so an old image can
    // never remain visible while a video/unsupported input shows its notice.
    try { fc.clear(); } catch {}
    wmObjRef.current = null;
    setBackgroundPreviewError('');
    setPreviewNotice('');
    const previewKind = classifyWatermarkPreview(path);
    if (previewKind === 'video') {
      setPreviewState('idle');
      setPreviewNotice('视频素材不会在水印画布中生成静态预览；可继续加入批处理队列。');
      return;
    }
    if (previewKind === 'unsupported') {
      setPreviewState('error');
      setBackgroundPreviewError('当前文件不支持在水印画布中预览。');
      return;
    }
    setPreviewState('loading');

    const result = await loadWatermarkPreview({
      path,
      toAssetUrl: async (input) => {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        return convertFileSrc(input);
      },
      fromUrl: async (url) => {
        const { FabricImage } = await import('fabric');
        return FabricImage.fromURL(url);
      },
      isCurrent: () => !isStale(imageGenRef, gen) && fabricRef.current === fc,
    });
    if (result.status === 'stale') return;
    if (result.status === 'ready') {
      const img = result.image;
      fc.backgroundImage = img;
      fc.renderAll();
      if (!isStale(imageGenRef, gen) && fabricRef.current === fc) {
        setPreviewState('ready');
        setBackgroundPreviewError('');
      }
    } else {
      setPreviewState('error');
      setBackgroundPreviewError('无法加载图片。请确认该文件仍存在且可访问，然后重试。');
      void logDiagnostic('error', 'WATERMARK_PREVIEW_LOAD_FAILED', result.error, 'asset-protocol image preview');
    }
  }, []);

  /* ── render watermark ── */
  const renderWatermark = useCallback(async () => {
    const gen = nextGen(watermarkGenRef);
    const fc = fabricRef.current;
    if (!fc || !currentFile) return;

    // remove old
    try { if (wmObjRef.current) { fc.remove(wmObjRef.current); wmObjRef.current = null; } } catch {}

    const { FabricText, FabricImage, Shadow: FabShadow } = await import('fabric');
    if (isStale(watermarkGenRef, gen) || fabricRef.current !== fc) return;

    const cw = fc.width ?? 800; const ch = fc.height ?? 600;
    const alpha = state.darkMode ? 0.06 : state.opacity;
    let obj: FabricObject | null = null;

    if (state.kind === 'text') {
      const shadow = state.shadowEnabled
        ? new FabShadow({ color: state.shadowColor, blur: state.shadowBlur, offsetX: state.shadowOffsetX, offsetY: state.shadowOffsetY })
        : null;
      const text = new (FabricText as any)(state.text, {
        fontSize: Math.max(16, ch * state.scale * 20 / 100),
        fontFamily: state.fontFamily, fill: state.color, opacity: alpha,
        selectable: true, hasControls: true, lockUniScaling: true,
        cornerStyle: 'circle', cornerColor: '#5b8def', cornerSize: 10, transparentCorners: false,
        stroke: state.strokeEnabled ? state.strokeColor : undefined,
        strokeWidth: state.strokeEnabled ? state.strokeWidth : 0,
        shadow: shadow as any, padding: 8,
      });
      text.set({ left: state.x || cw/2-(text.width??0)/2, top: state.y || ch/2-(text.height??0)/2, angle: state.rotation });
      text.scaleX = text.scaleY = state.scale;
      obj = text;
    } else if (state.imagePath) {
      const result = await loadWatermarkPreview({
        path: state.imagePath,
        toAssetUrl: async (input) => {
          const { convertFileSrc } = await import('@tauri-apps/api/core');
          return convertFileSrc(input);
        },
        fromUrl: (url) => FabricImage.fromURL(url),
        isCurrent: () => !isStale(watermarkGenRef, gen) && fabricRef.current === fc,
      });
      if (result.status === 'stale') return;
      if (result.status === 'ready') {
        const img = result.image;
          img.set({ opacity: alpha, selectable: true, hasControls: true, lockUniScaling: true,
            cornerStyle: 'circle', cornerColor: '#5b8def', cornerSize: 10, transparentCorners: false });
          img.set({ left: state.x || cw/2, top: state.y || ch/2, angle: state.rotation });
          img.scaleToWidth(cw * state.scale * 0.25);
          obj = img;
          setOverlayError('');
      } else {
        if (!isStale(watermarkGenRef, gen)) {
          setOverlayError('无法加载水印图片。请重新选择图片后重试。');
          void logDiagnostic('error', 'WATERMARK_OVERLAY_LOAD_FAILED', result.error, 'asset-protocol watermark overlay');
        }
      }
    }

    if (isStale(watermarkGenRef, gen) || fabricRef.current !== fc) return;
    if (obj) { fc.add(obj); wmObjRef.current = obj; }
    fc.renderAll();
  }, [currentFile, state]);

  /* ── file ops ── */
  async function pickFiles() {
    if (!apiRef.current) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ title:'选择文件', multiple:true,
      filters:[{name:'支持的媒体',extensions:['png','jpg','jpeg','webp','gif','mp4','mov']}]});
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    if (!mountedRef.current) return;
    setTasks(prev => [...prev, ...paths.map((p,i) => ({
      id:`wm-${Date.now()}-${i}`, path:p, name:p.replace(/\\/g,'/').split('/').pop()??`文件${i+1}`,
      status:'waiting' as const, progress:0
    }))]);
  }

  async function pickOutputDir() {
    if (!apiRef.current) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const dir = await open({ title:'选择输出文件夹', directory:true, multiple:false });
    if (!mountedRef.current) return;
    if (typeof dir === 'string') setState(prev => ({ ...prev, outputDirectory: dir }));
  }

  async function pickWatermarkImage() {
    if (!apiRef.current) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ title:'选择水印图片', multiple:false,
      filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}]});
    if (!mountedRef.current) return;
    if (typeof result === 'string') setState(prev => ({ ...prev, imagePath: result }));
  }

  /* ── task ── */
  async function startSingle(task: WatermarkTask) {
    if (!apiRef.current || task.status !== 'waiting' || activeTaskIdRef.current) return;
    const s = stateRef.current; // snapshot current params
    setActiveTaskId(task.id);
    setTasks(prev => prev.map(t => t.id===task.id ? {...t,status:'running',progress:0} : t));
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('start_watermark_media_task', { request: {
        taskId:task.id, inputPath:task.path,
        options: { kind:s.kind, text:s.text, imagePath:s.imagePath??null,
          position:'bottom-right', sizePercent:Math.round(s.scale*10),
          opacity:s.darkMode?0.06:s.opacity, pattern:s.pattern, density:s.density,
          angle:Math.round(s.rotation), darkMode:s.darkMode, outputDirectory:s.outputDirectory }
      }});
    } catch(e:any) {
      if (!mountedRef.current) return;
      setTasks(prev => prev.map(t => t.id===task.id ? {...t,status:'failed',error:e?.message??String(e)} : t));
      setActiveTaskId(undefined);
    }
  }

  async function startProcessing() {
    if (activeTaskIdRef.current) return;
    const next = tasks.find(t => t.status === 'waiting');
    if (!next) return;
    await startSingle(next);
  }

  async function cancelActive() {
    if (!apiRef.current || !activeTaskId) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cancel_gif_media_task', { taskId: activeTaskId });
    } catch(e:any) { setMessage(e?.message??'取消失败'); }
  }

  function removeTask(id:string) {
    if (activeTaskId === id) return;
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  function updateProp<K extends keyof WatermarkState>(key: K, value: WatermarkState[K]) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  /* ── init ── */
  /* ── real task events (pure state update) ── */
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('gif-media://task', (event: any) => {
        if (cancelled || !mountedRef.current) return;
        const p = event.payload;
        setTasks(prev => prev.map(t => {
          if (t.id !== p.taskId) return t;
          if (p.kind === 'progress') return { ...t, status: 'running' as WatermarkTask['status'], progress: Math.min(1, Math.max(0, p.progress)) };
          if (p.kind === 'completed') return { ...t, status: 'success' as WatermarkTask['status'], progress: 1, outputPath: p.outputPath, outputBytes: p.outputBytes, error: undefined };
          if (p.kind === 'cancelled') return { ...t, status: 'cancelled' as WatermarkTask['status'], error: undefined };
          if (p.kind === 'failed') return { ...t, status: 'failed' as WatermarkTask['status'], error: p.message || '失败' };
          return t;
        }));
      });
      if (!cancelled) unlistenRef.current = unlisten;
    })().catch(() => {});
    return () => { cancelled = true; unlistenRef.current?.(); };
  }, [desktop]);

  /* ── queue controller: advance when task finishes ── */
  useEffect(() => {
    const finished = tasks.find(t => t.id === activeTaskIdRef.current && (t.status === 'success' || t.status === 'failed' || t.status === 'cancelled'));
    if (!finished) return;
    setActiveTaskId(undefined);
    if (pendingReturnRef.current) {
      pendingReturnRef.current = false;
      onReturn();
      return;
    }
    if (!mountedRef.current) return;
    const next = tasks.find(t => t.status === 'waiting');
    if (next) {
      queueTimerRef.current = setTimeout(() => {
        if (mountedRef.current) startSingle(next);
      }, 200);
    }
  }, [tasks]);

  function requestReturn() {
    if (activeTaskId || tasks.length || state.outputDirectory || state.text !== DEFAULT_STATE.text) {
      setShowReturnConfirm(true);
    } else onReturn();
  }

  async function confirmReturn() {
    if (!activeTaskId) {
      setShowReturnConfirm(false);
      onReturn();
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('cancel_gif_media_task', { taskId: activeTaskId });
      pendingReturnRef.current = true;
      setShowReturnConfirm(false);
    } catch (e: any) {
      setMessage(e?.message ?? '取消失败，仍保留当前页面');
    }
  }

  useEffect(() => { initFabric(); }, [initFabric]);
  useEffect(() => { if (fabricReady && currentFile && fabricRef.current) loadImage(currentFile); }, [currentFile, fabricReady, loadImage]);
  useEffect(() => { if (fabricReady) renderWatermark(); }, [fabricReady, renderWatermark]);

  /* ── render ── */
  const canProcess = desktop && tasks.some(t=>t.status==='waiting') && state.outputDirectory && !activeTaskId;

  return (
    <div className="embedded-tool-wrapper">
      <ToolPageHeader
        title="水印与追溯"
        description="在画布中调整文字或 Logo 水印，再按队列批量落盘。"
        status="experimental"
        onReturn={requestReturn}
      />

      <div className="wm-layout">
        <aside className="wm-left" aria-label="素材与任务">
          <div className="wm-section">
            <div className="wm-section-head"><h3>素材</h3></div>
            <button className="wm-btn wm-btn-upload" onClick={pickFiles} disabled={!desktop} aria-label="导入图片素材">导入图片</button>
            <div className="wm-file-list">
              {tasks.map(t => (
                <div key={t.id} className={`wm-file ${t.status}`}>
                  <span className="wm-file-name" title={t.path}>{t.name}</span>
                  {t.status==='success' && <span className="wm-file-size">{fmtSize(t.outputBytes)}</span>}
                  {t.status==='failed' && <span className="wm-file-err">{t.error}</span>}
                  {t.status!=='running' && <button className="wm-file-remove" onClick={()=>removeTask(t.id)}>×</button>}
                </div>
              ))}
            </div>
          </div>
          <div className="wm-section">
            <label className="wm-label">输出目录</label>
            <button className="wm-btn wm-btn-pick" onClick={pickOutputDir} disabled={!desktop}>
              {state.outputDirectory || '选择文件夹'}
            </button>
          </div>
          {!activeTaskId ? (
          <button className="wm-btn wm-btn-run" disabled={!canProcess} onClick={startProcessing} aria-label="开始添加水印到所有素材">开始添加水印</button>
        ) : (
          <button className="wm-btn wm-btn-run" style={{background:"var(--color-danger)"}} onClick={cancelActive}>取消处理</button>
        )}
          {message && <p className="wm-error">{message}</p>}
        </aside>

        <main className="wm-canvas-wrap" aria-label="水印预览画布" role="img"
          onPointerDown={()=>setShowOriginal(true)} onPointerUp={()=>setShowOriginal(false)} onPointerLeave={()=>setShowOriginal(false)}>
          {!currentFile && <div className="wm-empty-canvas">{
            desktop ? '导入素材后在此预览水印效果'
              : desktopState === 'initializing' ? '桌面环境初始化中…'
                : desktopState === 'unavailable' ? '当前环境不支持本地水印处理'
                  : '桌面环境初始化失败，请返回工具箱后重试'
          }</div>}
          <div ref={canvasHostRef} className="wm-fabric-host" />
          {previewState === 'loading' && currentFile && <div className="wm-verify-ok">正在加载图片…</div>}
          {previewState === 'ready' && currentFile && <div className="wm-verify-ok">✓ 图片加载正常</div>}
          {previewNotice && <div className="wm-preview-error"><span>{previewNotice}</span></div>}
          {backgroundPreviewError && <div className="wm-preview-error"><span>{backgroundPreviewError}</span>
            <button onClick={()=>currentFile&&loadImage(currentFile)}>重试</button></div>}
          {overlayError && <div className="wm-preview-error"><span>{overlayError}</span>
            <button onClick={()=>renderWatermark()}>重试</button></div>}
          <div className="wm-canvas-hint">按住查看原图</div>
        </main>

        <aside className="wm-right" aria-label="水印属性">
          <div className="wm-section">
            <div className="wm-section-head"><h3>水印类型</h3></div>
            <div className="wm-segmented">
              <button className={state.kind==='text'?'active':''} onClick={()=>updateProp('kind','text')}>文字</button>
              <button className={state.kind==='image'?'active':''} onClick={()=>updateProp('kind','image')}>图片 Logo</button>
            </div>
          </div>
          {state.kind === 'text' && (
            <div className="wm-section">
              <div className="wm-section-head"><h3>文字</h3></div>
              <label className="wm-prop"><span>内容</span><input value={state.text} onChange={e=>updateProp('text',e.target.value)} /></label>
              <label className="wm-prop"><span>字体</span>
                <select value={state.fontFamily} onChange={e=>updateProp('fontFamily',e.target.value)} aria-label="字体选择">
                  <option value="Source Han Sans SC">思源黑体</option>
                  <option value="PingFang SC">苹方</option>
                  <option value="Arial">Arial</option>
                </select>
              </label>
            </div>
          )}
          {state.kind === 'image' && (
            <div className="wm-section">
              <div className="wm-section-head"><h3>水印图片</h3></div>
              <button className="wm-btn wm-btn-pick" onClick={pickWatermarkImage}>
                {state.imagePath ? state.imagePath.split('/').pop() : '选择图片'}
              </button>
            </div>
          )}
          <div className="wm-section">
            <div className="wm-section-head"><h3>位置与变换</h3></div>
            <div className="wm-prop-grid">
              <div className="wm-prop-row">
                <label className="wm-prop"><span>X</span><input type="number" value={Math.round(state.x)} onChange={e=>updateProp('x',Number(e.target.value))} /></label>
                <label className="wm-prop"><span>Y</span><input type="number" value={Math.round(state.y)} onChange={e=>updateProp('y',Number(e.target.value))} /></label>
                <button className="wm-btn-sm" onClick={()=>{updateProp('x',0);updateProp('y',0);}}>居中</button>
              </div>
              <label className="wm-prop"><span>旋转 {state.rotation}°</span>
                <input type="range" min={-180} max={180} value={state.rotation} onChange={e=>updateProp('rotation',Number(e.target.value))} onDoubleClick={()=>updateProp('rotation',0)} />
                <div className="wm-snap-btns">
                  <button onClick={()=>updateProp('rotation',0)}>0°</button>
                  <button onClick={()=>updateProp('rotation',45)}>45°</button>
                  <button onClick={()=>updateProp('rotation',90)}>90°</button>
                </div>
              </label>
              <label className="wm-prop"><span>缩放 {Math.round(state.scale*100)}%</span>
                <input type="range" min={20} max={200} value={Math.round(state.scale*100)} onChange={e=>updateProp('scale',Number(e.target.value)/100)} onDoubleClick={()=>updateProp('scale',1)} />
              </label>
            </div>
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>外观</h3></div>
            <div className="wm-prop-grid">
              {state.kind === 'text' && (
                <label className="wm-prop"><span>颜色</span><input type="color" value={state.color} onChange={e=>updateProp('color',e.target.value)} /></label>
              )}
              <label className="wm-prop"><span>透明度 {Math.round(state.darkMode?6:state.opacity*100)}%</span>
                <input type="range" min={0} max={100} value={state.darkMode?6:Math.round(state.opacity*100)} onChange={e=>{updateProp('opacity',Number(e.target.value)/100); if(state.darkMode)updateProp('darkMode',false);}} onDoubleClick={()=>updateProp('opacity',0.50)} />
              </label>
              {state.kind === 'text' && (<>
                <label className="wm-prop wm-prop-toggle"><input type="checkbox" checked={state.strokeEnabled} onChange={e=>updateProp('strokeEnabled',e.target.checked)} /><span>描边</span></label>
                {state.strokeEnabled && (<>
                  <label className="wm-prop"><span>描边颜色</span><input type="color" value={state.strokeColor} onChange={e=>updateProp('strokeColor',e.target.value)} /></label>
                  <label className="wm-prop"><span>粗细 {state.strokeWidth}px</span><input type="range" min={1} max={8} value={state.strokeWidth} onChange={e=>updateProp('strokeWidth',Number(e.target.value))} onDoubleClick={()=>updateProp('strokeWidth',1)} /></label>
                </>)}
                <label className="wm-prop wm-prop-toggle"><input type="checkbox" checked={state.shadowEnabled} onChange={e=>updateProp('shadowEnabled',e.target.checked)} /><span>投影</span></label>
                {state.shadowEnabled && (<>
                  <label className="wm-prop"><span>投影颜色</span><input type="color" value={state.shadowColor} onChange={e=>updateProp('shadowColor',e.target.value)} /></label>
                  <label className="wm-prop"><span>模糊 {state.shadowBlur}</span><input type="range" min={0} max={20} value={state.shadowBlur} onChange={e=>updateProp('shadowBlur',Number(e.target.value))} onDoubleClick={()=>updateProp('shadowBlur',4)} /></label>
                  <div className="wm-prop-row">
                    <label className="wm-prop"><span>X偏移</span><input type="number" value={state.shadowOffsetX} onChange={e=>updateProp('shadowOffsetX',Number(e.target.value))} /></label>
                    <label className="wm-prop"><span>Y偏移</span><input type="number" value={state.shadowOffsetY} onChange={e=>updateProp('shadowOffsetY',Number(e.target.value))} /></label>
                  </div>
                </>)}
              </>)}
              <label className="wm-prop wm-prop-toggle"><input type="checkbox" checked={state.darkMode} onChange={e=>updateProp('darkMode',e.target.checked)} /><span>暗水印（极淡·抗去除）</span></label>
            </div>
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>平铺</h3></div>
            <div className="wm-prop-grid">
              <label className="wm-prop"><span>排列</span>
                <select value={state.pattern} onChange={e=>updateProp('pattern',e.target.value as WatermarkPattern)} aria-label="水印排列方式">
                  <option value="single">单个</option><option value="tiled">网格平铺</option><option value="diagonal">斜向砖形</option>
                </select>
              </label>
              {state.pattern !== 'single' && (
                <label className="wm-prop"><span>密度</span>
                  <select value={state.density} onChange={e=>updateProp('density',e.target.value as 'low'|'medium'|'high')} aria-label="水印密度">
                    <option value="low">低</option><option value="medium">中等</option><option value="high">高</option>
                  </select>
                </label>
              )}
            </div>
          </div>
          {!desktop && <p className="wm-hint">水印处理仅桌面可用</p>}
        </aside>
      </div>
      {showReturnConfirm && (
        <ConfirmationDialog
          title={activeTaskId ? '正在处理' : '放弃当前设置？'}
          message={activeTaskId ? '返回前会先取消当前任务，并等待任务终态；取消失败时不会离开当前页面。' : '当前已导入素材或修改设置，放弃后将不会保留本次设置。'}
          confirmLabel={activeTaskId ? '取消任务并返回' : '放弃并返回'}
          destructive
          onCancel={() => setShowReturnConfirm(false)}
          onConfirm={() => { void confirmReturn(); }}
        />
      )}
    </div>
  );
}
