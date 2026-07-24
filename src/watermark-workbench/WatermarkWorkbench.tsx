import { useCallback, useEffect, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricImage, FabricObject } from 'fabric';
import { FABRIC_CANVAS_OPTIONS } from '../components/canvas/fabricSelection';

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
  const [tasks, setTasks] = useState<WatermarkTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [state, setState] = useState<WatermarkState>(DEFAULT_STATE);
  const [message, setMessage] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [verifyState, setVerifyState] = useState<'idle'|'ok'|'fail'>('idle');

  /* ── lifecycle guards ── */
  const mountedRef = useRef(true);
  const genRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const wmObjRef = useRef<FabricObject | null>(null);
  const apiRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const queueTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const unlistenRef = useRef<(() => void)|null>(null);

  const currentFile = tasks[0]?.path;

  function nextGen() { genRef.current += 1; return genRef.current; }
  function isStale(gen: number) { return !mountedRef.current || genRef.current !== gen; }

  /* ── cleanup (run first in unmount) ── */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
      unlistenRef.current?.();
      // disconnect observer
      roRef.current?.disconnect();
      roRef.current = null;
      // dispose fabric
      const fc = fabricRef.current;
      if (fc) {
        try { fc.off('object:modified'); } catch {}
        try { fc.off('object:moving'); } catch {}
        try { fc.off('object:scaling'); } catch {}
        try { fc.off('object:rotating'); } catch {}
        try { fc.dispose(); } catch {}
        fabricRef.current = null;
      }
      wmObjRef.current = null;
    };
  }, []);

  /* ── init fabric ── */
  const initFabric = useCallback(async () => {
    const gen = nextGen();
    const { Canvas } = await import('fabric');
    if (isStale(gen) || !canvasRef.current) return;

    const fc = new Canvas(canvasRef.current, {
      ...FABRIC_CANVAS_OPTIONS, selection: true, preserveObjectStacking: true,
      width: containerRef.current?.clientWidth ?? 800,
      height: containerRef.current?.clientHeight ?? 600,
    });
    if (isStale(gen)) { try { fc.dispose(); } catch {} return; }
    fabricRef.current = fc;

    // ResizeObserver
    if (containerRef.current) {
      const ro = new ResizeObserver(() => {
        if (!mountedRef.current || fabricRef.current !== fc) return;
        try {
          fabricRef.current.setDimensions({
            width: containerRef.current!.clientWidth,
            height: containerRef.current!.clientHeight,
          });
          fabricRef.current.renderAll();
        } catch {}
      });
      ro.observe(containerRef.current);
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

  /* ── load image ── */
  const loadImage = useCallback(async (path: string) => {
    const gen = nextGen();
    const fc = fabricRef.current;
    if (!fc) return;

    // clear previous
    try { fc.clear(); } catch {}
    wmObjRef.current = null;

    const { FabricImage } = await import('fabric');
    if (isStale(gen) || fabricRef.current !== fc) return;

    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const url = convertFileSrc(path);

    try {
      const img = await FabricImage.fromURL(url);
      if (isStale(gen) || fabricRef.current !== fc || !img) return;
      fc.backgroundImage = img;
      fc.renderAll();
      setPreviewError('');
      setVerifyState('ok');
    } catch (e: any) {
      if (isStale(gen)) return;
      setPreviewError(`无法加载图片: ${e?.message || '未知错误'}`);
      setVerifyState('fail');
    }
  }, []);

  /* ── render watermark ── */
  const renderWatermark = useCallback(async () => {
    const gen = nextGen();
    const fc = fabricRef.current;
    if (!fc || !currentFile) return;

    // remove old
    try { if (wmObjRef.current) { fc.remove(wmObjRef.current); wmObjRef.current = null; } } catch {}

    const { FabricText, FabricImage, Shadow: FabShadow } = await import('fabric');
    if (isStale(gen) || fabricRef.current !== fc) return;

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
      try {
        const { convertFileSrc: cfs } = await import('@tauri-apps/api/core');
        const img = await FabricImage.fromURL(cfs(state.imagePath));
        if (isStale(gen) || fabricRef.current !== fc) return;
        if (img) {
          img.set({ opacity: alpha, selectable: true, hasControls: true, lockUniScaling: true,
            cornerStyle: 'circle', cornerColor: '#5b8def', cornerSize: 10, transparentCorners: false });
          img.set({ left: state.x || cw/2, top: state.y || ch/2, angle: state.rotation });
          img.scaleToWidth(cw * state.scale * 0.25);
          obj = img;
        }
      } catch {} // non-critical
    }

    if (isStale(gen) || fabricRef.current !== fc) return;
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
    if (!apiRef.current || task.status !== 'waiting') return;
    setActiveTaskId(task.id);
    setTasks(prev => prev.map(t => t.id===task.id ? {...t,status:'running',progress:0} : t));
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('start_watermark_media_task', { request: {
        taskId:task.id, inputPath:task.path,
        options: { kind:state.kind, text:state.text, imagePath:state.imagePath??null,
          position:'bottom-right', sizePercent:Math.round(state.scale*10),
          opacity:state.darkMode?0.06:state.opacity, pattern:state.pattern, density:state.density,
          angle:Math.round(state.rotation), darkMode:state.darkMode, outputDirectory:state.outputDirectory }
      }});
      // Completion handled by gif-media://task event listener
    } catch(e:any) {
      if (!mountedRef.current) return;
      setTasks(prev => prev.map(t => t.id===task.id ? {...t,status:'failed',error:e?.message??String(e)} : t));
      setActiveTaskId(undefined);
    }
  }

  async function startProcessing() {
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
  /* ── real task events ── */
  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen('gif-media://task', (event: any) => {
        if (cancelled || !mountedRef.current) return;
        const p = event.payload;
        setTasks(prev => {
          const updated = prev.map(t => {
            if (t.id !== p.taskId) return t;
            if (p.kind === 'progress') return { ...t, status: 'running' as WatermarkTask['status'], progress: Math.min(1, Math.max(0, p.progress)) };
            if (p.kind === 'completed') return { ...t, status: 'success' as WatermarkTask['status'], progress: 1, outputPath: p.outputPath, outputBytes: p.outputBytes, error: undefined };
            if (p.kind === 'cancelled') return { ...t, status: 'cancelled' as WatermarkTask['status'], error: undefined };
            if (p.kind === 'failed') return { ...t, status: 'failed' as WatermarkTask['status'], error: p.message || '失败' };
            return t;
          });
          const done = updated.find(t => t.id === p.taskId);
          if (done && (done.status === 'success' || done.status === 'failed' || done.status === 'cancelled')) {
            if (done.id === activeTaskId) setActiveTaskId(undefined);
            setTimeout(() => {
              if (!mountedRef.current) return;
              setTasks(prev2 => { const n = prev2.find(t2 => t2.status === 'waiting'); if (n) startSingle(n); return prev2; });
            }, 200);
          }
          return updated;
        });
      });
      if (!cancelled) unlistenRef.current = unlisten;
    })().catch(() => {});
    return () => { cancelled = true; unlistenRef.current?.(); };
  }, [desktop]);

  useEffect(() => { initFabric(); }, [initFabric]);
  useEffect(() => { if (currentFile && fabricRef.current) loadImage(currentFile); }, [currentFile, loadImage]);
  useEffect(() => { renderWatermark(); }, [renderWatermark]);

  /* ── self-verify ── */
  useEffect(() => {
    if (!desktop || !currentFile) return;
    let cancelled = false;
    (async () => {
      try {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        const url = convertFileSrc(currentFile);
        const testImg = new Image();
        await new Promise<void>((resolve, reject) => {
          testImg.onload = () => resolve();
          testImg.onerror = () => reject(new Error('Image load failed'));
          testImg.src = url;
        });
        if (cancelled) return;
        setPreviewError('');
        setVerifyState('ok');
      } catch (e: any) {
        if (cancelled) return;
        setPreviewError(`图片加载失败: ${e?.message || '未知错误'}。路径: ${currentFile}`);
        setVerifyState('fail');
      }
    })();
    return () => { cancelled = true; };
  }, [desktop, currentFile]);

  /* ── render ── */
  const canProcess = desktop && tasks.some(t=>t.status==='waiting') && state.outputDirectory && !activeTaskId;

  return (
    <div className="embedded-tool-wrapper">
      <header className="embedded-tool-topbar">
        <button className="embedded-tool-back" onClick={onReturn}>← 返回工具箱</button>
        <span className="embedded-tool-title">水印与追溯</span>
      </header>

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

        <main className="wm-canvas-wrap" ref={containerRef} aria-label="水印预览画布" role="img"
          onPointerDown={()=>setShowOriginal(true)} onPointerUp={()=>setShowOriginal(false)} onPointerLeave={()=>setShowOriginal(false)}>
          {!currentFile && <div className="wm-empty-canvas">{desktop ? '导入素材后在此预览水印效果' : '桌面环境初始化中…'}</div>}
          <canvas ref={canvasRef} />
          {verifyState === 'fail' && <div className="wm-preview-error"><span>⚠ 图片加载验证失败。请确认文件路径不含特殊字符，或尝试重新导入。</span><button onClick={() => currentFile && setVerifyState('idle')}>重试</button></div>}
          {verifyState === 'ok' && currentFile && <div className="wm-verify-ok">✓ 图片加载正常</div>}
          {previewError && <div className="wm-preview-error"><span>{previewError}</span>
            <button onClick={()=>currentFile&&loadImage(currentFile)}>重试</button></div>}
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
    </div>
  );
}
