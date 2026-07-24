import { useCallback, useEffect, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricImage, FabricObject, Shadow } from 'fabric';
import { FABRIC_CANVAS_OPTIONS } from '../components/canvas/fabricSelection';

/* ── types ── */
type WatermarkKind = 'text' | 'image';
type WatermarkPattern = 'single' | 'tiled' | 'diagonal';

type WatermarkState = {
  kind: WatermarkKind;
  text: string;
  imagePath?: string;
  pattern: WatermarkPattern;
  density: 'low' | 'medium' | 'high';
  /* position & transform */
  x: number; y: number;
  scale: number;  // 0.5 ~ 2.0
  rotation: number; // degrees
  /* text style */
  fontFamily: string;
  color: string;
  /* appearance */
  opacity: number;  // 0 ~ 1
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number; // px
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  /* output */
  darkMode: boolean;
  outputDirectory: string;
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const bgImageRef = useRef<FabricImage | null>(null);
  const wmObjRef = useRef<FabricObject | null>(null);
  const apiRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const syncLockRef = useRef(false);

  const currentFile = tasks[0]?.path;

  /* ── fabric init ── */
  const initFabric = useCallback(async () => {
    if (!canvasRef.current || fabricRef.current) return;
    const { Canvas } = await import('fabric');
    const fc = new Canvas(canvasRef.current, {
      ...FABRIC_CANVAS_OPTIONS, selection: true, preserveObjectStacking: true,
      width: containerRef.current?.clientWidth ?? 800, height: containerRef.current?.clientHeight ?? 600,
    });
    fabricRef.current = fc;
    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !fabricRef.current) return;
      fabricRef.current.setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      fabricRef.current.renderAll();
    });
    ro.observe(containerRef.current!);

    // sync canvas → state
    const syncToState = () => {
      if (syncLockRef.current) return;
      const obj = wmObjRef.current;
      if (!obj) return;
      syncLockRef.current = true;
      setState(prev => ({
        ...prev,
        x: Math.round((obj.left ?? prev.x) * 10) / 10,
        y: Math.round((obj.top ?? prev.y) * 10) / 10,
        scale: Math.round(((obj.scaleX ?? prev.scale) + (obj.scaleY ?? prev.scale)) / 2 * 100) / 100,
        rotation: Math.round(obj.angle ?? prev.rotation),
        opacity: Math.round((obj.opacity ?? prev.opacity) * 100) / 100,
      }));
      setTimeout(() => { syncLockRef.current = false; }, 0);
    };
    fc.on('object:modified', syncToState);
    fc.on('object:moving', syncToState);
    fc.on('object:scaling', syncToState);
    fc.on('object:rotating', syncToState);
  }, []);

  /* ── load image ── */
  const loadImage = useCallback(async (path: string) => {
    if (!fabricRef.current) return;
    const { FabricImage } = await import('fabric');
    const fc = fabricRef.current;
    fc.clear(); wmObjRef.current = null;
    try {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      const url = convertFileSrc(path);
      const img = await FabricImage.fromURL(url);
      if (!img) return;
      bgImageRef.current = img;
      fc.backgroundImage = img;
      fc.renderAll();
      setPreviewError('');
    } catch { setPreviewError('无法加载图片'); }
  }, []);

  /* ── render watermark ── */
  const renderWatermark = useCallback(async () => {
    const fc = fabricRef.current;
    if (!fc || !currentFile) return;
    syncLockRef.current = true;
    if (wmObjRef.current) fc.remove(wmObjRef.current);

    const { FabricText, FabricImage, Shadow: FabShadow } = await import('fabric');
    const cw = fc.width ?? 800; const ch = fc.height ?? 600;
    const alpha = state.darkMode ? 0.06 : state.opacity;
    let obj: FabricObject | null = null;

    if (state.kind === 'text') {
      const shadow = state.shadowEnabled
        ? new FabShadow({ color: state.shadowColor, blur: state.shadowBlur, offsetX: state.shadowOffsetX, offsetY: state.shadowOffsetY })
        : null;
      const text = new (FabricText as any)(state.text, {
        fontSize: Math.max(16, ch * state.scale * 20 / 100),
        fontFamily: state.fontFamily,
        fill: state.color,
        opacity: alpha,
        selectable: true, hasControls: true, lockUniScaling: true,
        cornerStyle: 'circle', cornerColor: '#5b8def', cornerSize: 10, transparentCorners: false,
        stroke: state.strokeEnabled ? state.strokeColor : undefined,
        strokeWidth: state.strokeEnabled ? state.strokeWidth : 0,
        shadow: shadow as any,
        padding: 8,
      });
      text.set({ left: state.x || cw / 2 - (text.width ?? 0) / 2, top: state.y || ch / 2 - (text.height ?? 0) / 2 });
      text.set({ angle: state.rotation });
      text.scaleX = text.scaleY = state.scale;
      obj = text;
    } else if (state.imagePath) {
      try {
        const { convertFileSrc: cfs } = await import('@tauri-apps/api/core');
        const img = await FabricImage.fromURL(cfs(state.imagePath!));
        if (img) {
          img.set({
            opacity: alpha, selectable: true, hasControls: true, lockUniScaling: true,
            cornerStyle: 'circle', cornerColor: '#5b8def', cornerSize: 10, transparentCorners: false,
          });
          img.set({ left: state.x || cw / 2, top: state.y || ch / 2, angle: state.rotation });
          img.scaleToWidth(cw * state.scale * 0.25);
          obj = img;
        }
      } catch {}
    }

    if (obj) { fc.add(obj); wmObjRef.current = obj; }
    fc.renderAll();
    setTimeout(() => { syncLockRef.current = false; }, 100);
  }, [currentFile, state]);

  /* ── update state from canvas on user interaction ── */
  function updateProp<K extends keyof WatermarkState>(key: K, value: WatermarkState[K]) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  /* ── file ops ── */
  async function pickFiles() {
    if (!apiRef.current) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ title:'选择文件', multiple:true,
      filters:[{name:'支持的媒体',extensions:['png','jpg','jpeg','webp','gif','mp4','mov']}]});
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    setTasks(prev => [...prev, ...paths.map((p,i) => ({
      id:`wm-${Date.now()}-${i}`, path:p, name:p.replace(/\\/g,'/').split('/').pop()??`文件${i+1}`,
      status:'waiting' as const, progress:0
    }))]);
  }

  async function pickOutputDir() {
    if (!apiRef.current) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const dir = await open({ title:'选择输出文件夹', directory:true, multiple:false });
    if (typeof dir === 'string') updateProp('outputDirectory', dir);
  }

  async function pickWatermarkImage() {
    if (!apiRef.current) return;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ title:'选择水印图片', multiple:false,
      filters:[{name:'图片',extensions:['png','jpg','jpeg','webp']}]});
    if (typeof result === 'string') updateProp('imagePath', result);
  }

  /* ── task ── */
  async function startProcessing() {
    if (!apiRef.current || !tasks.length) return;
    const next = tasks.find(t => t.status === 'waiting');
    if (!next) return;
    setActiveTaskId(next.id);
    setTasks(prev => prev.map(t => t.id===next.id ? {...t,status:'running',progress:0} : t));
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result: any = await invoke('start_watermark_media_task', { request: {
        taskId:next.id, inputPath:next.path,
        options: {
          kind:state.kind, text:state.text, imagePath:state.imagePath??null,
          position:'bottom-right', sizePercent:Math.round(state.scale*10),
          opacity:state.darkMode?0.06:state.opacity,
          pattern:state.pattern, density:state.density, angle:Math.round(state.rotation),
          darkMode:state.darkMode, outputDirectory:state.outputDirectory,
        }
      }});
      setTasks(prev => prev.map(t => t.id===next.id ? {...t,status:'success',outputPath:result.outputPath} : t));
    } catch(e:any) {
      setTasks(prev => prev.map(t => t.id===next.id ? {...t,status:'failed',error:e?.message??String(e)} : t));
    }
    setActiveTaskId(undefined);
  }

  function removeTask(id:string) {
    if (activeTaskId === id) return;
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  /* ── init ── */
  useEffect(() => { async function init() { try { const m=await import('../gif-media/mediaDesktop'); if(!m.isMediaDesktopAvailable())return; setDesktop(true); apiRef.current=await m.loadMediaDesktopApi(); } catch{} } init(); }, []);

  /* ── self-verify image loading ── */
  useEffect(() => {
    if (!desktop || !currentFile) return;
    async function verify() {
      try {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        const url = convertFileSrc(currentFile!);
        const testImg = new Image();
        await new Promise<void>((resolve, reject) => {
          testImg.onload = () => resolve();
          testImg.onerror = () => reject(new Error('Image load failed'));
          testImg.src = url;
        });
        setPreviewError('');
        setVerifyState('ok');
      } catch (e: any) {
        setPreviewError(`图片加载失败: ${e?.message || '未知错误'}。路径: ${currentFile}`);
        setVerifyState('fail');
      }
    }
    verify();
  }, [desktop, currentFile]);
  useEffect(() => { initFabric(); }, [initFabric]);
  useEffect(() => { if (currentFile && fabricRef.current) loadImage(currentFile); }, [currentFile, loadImage]);
  useEffect(() => { renderWatermark(); }, [renderWatermark]);

  /* ── render ── */
  const canProcess = desktop && tasks.some(t=>t.status==='waiting') && state.outputDirectory && !activeTaskId;

  return (
    <div className="embedded-tool-wrapper">
      <header className="embedded-tool-topbar">
        <button className="embedded-tool-back" onClick={onReturn}>← 返回工具箱</button>
        <span className="embedded-tool-title">水印与追溯</span>
      </header>

      <div className="wm-layout">
        {/* LEFT */}
        <aside className="wm-left">
          <div className="wm-section">
            <div className="wm-section-head"><h3>素材</h3></div>
            <button className="wm-btn wm-btn-upload" onClick={pickFiles} disabled={!desktop}>导入图片</button>
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
          <button className="wm-btn wm-btn-run" disabled={!canProcess} onClick={startProcessing}>开始添加水印</button>
          {message && <p className="wm-error">{message}</p>}
        </aside>

        {/* CENTER */}
        <main className="wm-canvas-wrap" ref={containerRef}
          onPointerDown={()=>setShowOriginal(true)} onPointerUp={()=>setShowOriginal(false)} onPointerLeave={()=>setShowOriginal(false)}>
          {!currentFile && <div className="wm-empty-canvas">{desktop ? '导入素材后在此预览水印效果' : '桌面环境初始化中…'}</div>}
          {verifyState === 'fail' && <div className="wm-preview-error"><span>⚠ 图片加载验证失败。请确认文件路径不含特殊字符，或尝试重新导入。</span><button onClick={() => currentFile && setVerifyState('idle')}>重试</button></div>}
          {verifyState === 'ok' && currentFile && <div className="wm-verify-ok">✓ 图片加载正常</div>}
          <canvas ref={canvasRef} style={{ opacity: showOriginal ? 1 : 1 }} />
          {previewError && <div className="wm-preview-error"><span>{previewError}</span>
            <button onClick={()=>currentFile&&loadImage(currentFile)}>重试</button></div>}
          <div className="wm-canvas-hint">按住查看原图</div>
        </main>

        {/* RIGHT */}
        <aside className="wm-right">
          {/* 水印类型 */}
          <div className="wm-section">
            <div className="wm-section-head"><h3>水印类型</h3></div>
            <div className="wm-segmented">
              <button className={state.kind==='text'?'active':''} onClick={()=>updateProp('kind','text')}>文字</button>
              <button className={state.kind==='image'?'active':''} onClick={()=>updateProp('kind','image')}>图片 Logo</button>
            </div>
          </div>

          {/* 文字内容 */}
          {state.kind === 'text' && (
            <div className="wm-section">
              <div className="wm-section-head"><h3>文字</h3></div>
              <label className="wm-prop">
                <span>内容</span>
                <input value={state.text} onChange={e=>updateProp('text', e.target.value)} />
              </label>
              <label className="wm-prop">
                <span>字体</span>
                <select value={state.fontFamily}
                  onChange={e=>updateProp('fontFamily', e.target.value)}>
                  <option value="Source Han Sans SC">思源黑体</option>
                  <option value="PingFang SC">苹方</option>
                  <option value="Arial">Arial</option>
                </select>
              </label>
            </div>
          )}

          {/* 水印图片 */}
          {state.kind === 'image' && (
            <div className="wm-section">
              <div className="wm-section-head"><h3>水印图片</h3></div>
              <button className="wm-btn wm-btn-pick" onClick={pickWatermarkImage}>
                {state.imagePath ? state.imagePath.split('/').pop() : '选择图片'}
              </button>
            </div>
          )}

          {/* 位置与变换 */}
          <div className="wm-section">
            <div className="wm-section-head"><h3>位置与变换</h3></div>
            <div className="wm-prop-grid">
              <div className="wm-prop-row">
                <label className="wm-prop"><span>X</span>
                  <input type="number" value={Math.round(state.x)} onChange={e=>updateProp('x',Number(e.target.value))} /></label>
                <label className="wm-prop"><span>Y</span>
                  <input type="number" value={Math.round(state.y)} onChange={e=>updateProp('y',Number(e.target.value))} /></label>
                <button className="wm-btn-sm" onClick={()=>{updateProp('x',0);updateProp('y',0);}}>居中</button>
              </div>
              <label className="wm-prop">
                <span>旋转 {state.rotation}°</span>
                <input type="range" min={-180} max={180} value={state.rotation}
                  onChange={e=>updateProp('rotation',Number(e.target.value))}
                  onDoubleClick={()=>updateProp('rotation',0)} />
                <div className="wm-snap-btns">
                  <button onClick={()=>updateProp('rotation',0)}>0°</button>
                  <button onClick={()=>updateProp('rotation',45)}>45°</button>
                  <button onClick={()=>updateProp('rotation',90)}>90°</button>
                </div>
              </label>
              <label className="wm-prop">
                <span>缩放 {Math.round(state.scale*100)}%</span>
                <input type="range" min={20} max={200} value={Math.round(state.scale*100)}
                  onChange={e=>updateProp('scale',Number(e.target.value)/100)}
                  onDoubleClick={()=>updateProp('scale',1)} />
              </label>
            </div>
          </div>

          {/* 外观 */}
          <div className="wm-section">
            <div className="wm-section-head"><h3>外观</h3></div>
            <div className="wm-prop-grid">
              {state.kind === 'text' && (
                <label className="wm-prop">
                  <span>颜色</span>
                  <input type="color" value={state.color} onChange={e=>updateProp('color',e.target.value)} />
                </label>
              )}
              <label className="wm-prop">
                <span>透明度 {Math.round(state.darkMode?6:state.opacity*100)}%</span>
                <input type="range" min={0} max={100} value={state.darkMode?6:Math.round(state.opacity*100)}
                  onChange={e=>{updateProp('opacity',Number(e.target.value)/100); if(state.darkMode)updateProp('darkMode',false);}}
                  onDoubleClick={()=>updateProp('opacity',0.50)} />
              </label>
              {state.kind === 'text' && (
                <>
                  <label className="wm-prop wm-prop-toggle">
                    <input type="checkbox" checked={state.strokeEnabled} onChange={e=>updateProp('strokeEnabled',e.target.checked)} />
                    <span>描边</span>
                  </label>
                  {state.strokeEnabled && <>
                    <label className="wm-prop"><span>描边颜色</span><input type="color" value={state.strokeColor} onChange={e=>updateProp('strokeColor',e.target.value)} /></label>
                    <label className="wm-prop"><span>粗细 {state.strokeWidth}px</span><input type="range" min={1} max={8} value={state.strokeWidth} onChange={e=>updateProp('strokeWidth',Number(e.target.value))} onDoubleClick={()=>updateProp('strokeWidth',1)} /></label>
                  </>}
                  <label className="wm-prop wm-prop-toggle">
                    <input type="checkbox" checked={state.shadowEnabled} onChange={e=>updateProp('shadowEnabled',e.target.checked)} />
                    <span>投影</span>
                  </label>
                  {state.shadowEnabled && <>
                    <label className="wm-prop"><span>投影颜色</span><input type="color" value={state.shadowColor} onChange={e=>updateProp('shadowColor',e.target.value)} /></label>
                    <label className="wm-prop"><span>模糊 {state.shadowBlur}</span><input type="range" min={0} max={20} value={state.shadowBlur} onChange={e=>updateProp('shadowBlur',Number(e.target.value))} onDoubleClick={()=>updateProp('shadowBlur',4)} /></label>
                    <div className="wm-prop-row">
                      <label className="wm-prop"><span>X偏移</span><input type="number" value={state.shadowOffsetX} onChange={e=>updateProp('shadowOffsetX',Number(e.target.value))} /></label>
                      <label className="wm-prop"><span>Y偏移</span><input type="number" value={state.shadowOffsetY} onChange={e=>updateProp('shadowOffsetY',Number(e.target.value))} /></label>
                    </div>
                  </>}
                </>
              )}
              <label className="wm-prop wm-prop-toggle">
                <input type="checkbox" checked={state.darkMode} onChange={e=>updateProp('darkMode',e.target.checked)} />
                <span>暗水印（极淡·抗去除）</span>
              </label>
            </div>
          </div>

          {/* 平铺 */}
          <div className="wm-section">
            <div className="wm-section-head"><h3>平铺</h3></div>
            <div className="wm-prop-grid">
              <label className="wm-prop">
                <span>排列</span>
                <select value={state.pattern} onChange={e=>updateProp('pattern',e.target.value as WatermarkPattern)}>
                  <option value="single">单个</option>
                  <option value="tiled">网格平铺</option>
                  <option value="diagonal">斜向砖形</option>
                </select>
              </label>
              {state.pattern !== 'single' && (
                <label className="wm-prop">
                  <span>密度</span>
                  <select value={state.density} onChange={e=>updateProp('density',e.target.value as 'low'|'medium'|'high')}>
                    <option value="low">低</option>
                    <option value="medium">中等</option>
                    <option value="high">高</option>
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
