import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToolPageHeader } from '../components';
import { BoardCanvas } from '../components/canvas';
import {
  canvasToBlob,
  createInitialCropState,
  createMaterialAsset,
  DEFAULT_BRAND_LAYER,
  releaseMaterialAsset,
  renderBoardToCanvas,
  type MaterialAsset,
  type MaterialFormat,
  type MaterialSpec,
} from '../core';
import { adaptWatermarkConfig, type WatermarkStateAdapter } from '../core/image/watermarkRenderPlan';
import { logDiagnostic } from '../diagnostics/client';
import type { MediaDesktopApi } from '../gif-media/mediaDesktop';
import type { WatermarkOptions } from '../gif-media/mediaTypes';
import { ConfirmationDialog } from '../modules/media-workbench/ConfirmationDialog';
import { saveBlobToOutputTarget } from '../platform/fileSystem';
import { classifyWatermarkPreview } from './watermarkPreview';
import {
  formatFileUrlDiagnostic,
  runFileUrlDiagnostic,
  type FileUrlDiagnosticReport,
  type FileUrlDiagnosticTarget,
} from './fileUrlDiagnostic';

type WatermarkKind = 'text' | 'image';
type WatermarkPattern = 'single' | 'tiled' | 'diagonal';
type WatermarkDensity = 'low' | 'medium' | 'high';

type WatermarkState = WatermarkStateAdapter & {
  kind: WatermarkKind;
  pattern: WatermarkPattern;
  density: WatermarkDensity;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  darkMode: boolean;
  outputDirectory: string;
};

type WatermarkTask = {
  id: string;
  path: string;
  name: string;
  status: 'waiting' | 'running' | 'success' | 'failed' | 'cancelled';
  progress: number;
  outputPath?: string;
  outputBytes?: number;
  error?: string;
};

type WatermarkTaskRequestOptions = Omit<WatermarkOptions, 'imagePath'> & {
  imagePath?: string | null;
  pattern: WatermarkPattern;
  density: WatermarkDensity;
  angle: number;
  darkMode: boolean;
};

const DEFAULT_STATE: WatermarkState = {
  kind: 'text',
  text: '品宣物料工作台',
  pattern: 'diagonal',
  density: 'medium',
  x: 0,
  y: 0,
  scale: 1,
  rotation: 45,
  fontFamily: 'Source Han Sans SC',
  color: '#ffffff',
  opacity: 0.5,
  strokeEnabled: false,
  strokeColor: '#000000',
  strokeWidth: 1,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowBlur: 4,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  darkMode: false,
  outputDirectory: '',
};

const IS_FILE_URL_DIAGNOSTIC_RC = import.meta.env.VITE_FILE_URL_DIAGNOSTIC_RC === 'true';
const FILE_URL_DIAGNOSTIC_VERSION = import.meta.env.VITE_APP_VERSION;
const TERMINAL_TASK_STATUSES = new Set<WatermarkTask['status']>(['success', 'failed', 'cancelled']);

function imageFormat(path: string): MaterialFormat {
  return /\.(jpe?g)$/i.test(path) ? 'jpg' : 'png';
}

/** GIF stays on the established FFmpeg queue; only still images use Canvas. */
export function isStaticCanvasImage(path: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(path);
}

export function watermarkOutputName(path: string, format: MaterialFormat): string {
  const name = path.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') || 'media';
  return `${name}_watermarked.${format}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function releaseAsset(asset: MaterialAsset | undefined): void {
  if (asset) releaseMaterialAsset(asset);
}

export function createWorkbenchWatermarkConfig(
  canvas: { width: number; height: number },
  state: WatermarkStateAdapter & { darkMode: boolean },
  imageAsset?: MaterialAsset,
) {
  return adaptWatermarkConfig(canvas, {
    ...state,
    opacity: state.darkMode ? 0.06 : state.opacity,
    imageAsset,
  });
}

export function WatermarkWorkbench({ onReturn }: { onReturn: () => void }) {
  const [desktopState, setDesktopState] = useState<'initializing' | 'ready' | 'unavailable' | 'failed'>('initializing');
  const [engineReady, setEngineReady] = useState(false);
  const [taskEventsReady, setTaskEventsReady] = useState(false);
  const [tasks, setTasks] = useState<WatermarkTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string>();
  const [state, setState] = useState<WatermarkState>(DEFAULT_STATE);
  const [message, setMessage] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [previewNotice, setPreviewNotice] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [overlayError, setOverlayError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const [logoRetry, setLogoRetry] = useState(0);
  const [backgroundAsset, setBackgroundAsset] = useState<MaterialAsset>();
  const [watermarkAsset, setWatermarkAsset] = useState<MaterialAsset>();
  const [previewScale, setPreviewScale] = useState(1);
  const [fileUrlReports, setFileUrlReports] = useState<FileUrlDiagnosticReport[]>([]);
  const [fileUrlDiagnosticInFlight, setFileUrlDiagnosticInFlight] = useState(0);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  const mountedRef = useRef(true);
  const backgroundGenerationRef = useRef(0);
  const logoGenerationRef = useRef(0);
  const apiRef = useRef<MediaDesktopApi>();
  const backgroundRef = useRef<MaterialAsset>();
  const logoRef = useRef<MaterialAsset>();
  const activeTaskIdRef = useRef<string>();
  const activeTaskIsLocalRef = useRef(false);
  const stateRef = useRef(state);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const outputNamesRef = useRef(new Set<string>());
  const queueTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingReturnRef = useRef(false);

  stateRef.current = state;
  activeTaskIdRef.current = activeTaskId;

  const currentFile = tasks[0]?.path;
  const spec = useMemo<MaterialSpec>(() => backgroundAsset
    ? {
        id: 'watermark-preview',
        name: 'watermark-preview',
        width: backgroundAsset.width,
        height: backgroundAsset.height,
        format: imageFormat(backgroundAsset.fileName),
      }
    : { id: 'watermark-preview', name: 'watermark-preview', width: 800, height: 600, format: 'png' }, [backgroundAsset]);
  const boardPreviewState = useMemo(() => backgroundAsset
    ? {
        assetId: backgroundAsset.id,
        specId: spec.id,
        fitMode: 'contain' as const,
        crop: createInitialCropState(backgroundAsset, spec, 'contain'),
      }
    : undefined, [backgroundAsset, spec]);
  const watermarkConfig = useMemo(() => backgroundAsset
    ? createWorkbenchWatermarkConfig({ width: spec.width, height: spec.height }, state, watermarkAsset)
    : undefined, [backgroundAsset, spec.height, spec.width, state, watermarkAsset]);

  const updateProp = useCallback(<K extends keyof WatermarkState>(key: K, value: WatermarkState[K]) => {
    setState((previous) => ({ ...previous, [key]: value }));
  }, []);

  const replaceBackgroundAsset = useCallback((next: MaterialAsset | undefined) => {
    const previous = backgroundRef.current;
    backgroundRef.current = next;
    setBackgroundAsset(next);
    if (previous && previous !== next) releaseAsset(previous);
  }, []);

  const replaceLogoAsset = useCallback((next: MaterialAsset | undefined) => {
    const previous = logoRef.current;
    logoRef.current = next;
    setWatermarkAsset(next);
    if (previous && previous !== next) releaseAsset(previous);
  }, []);

  const recordFileUrlDiagnostic = useCallback(async (target: FileUrlDiagnosticTarget, path: string) => {
    if (!IS_FILE_URL_DIAGNOSTIC_RC) return;
    setFileUrlDiagnosticInFlight((count) => count + 1);
    try {
      const report = await runFileUrlDiagnostic({
        target,
        rawPath: path,
        appVersion: FILE_URL_DIAGNOSTIC_VERSION,
        convertFileSrc: async (input) => (await import('@tauri-apps/api/core')).convertFileSrc(input),
        fsProbe: async (input) => {
          const metadata = await (await import('@tauri-apps/plugin-fs')).stat(input);
          return {
            exists: true,
            metadata: { isFile: metadata.isFile, isDirectory: metadata.isDirectory, size: metadata.size },
          };
        },
        readFile: async (input) => (await import('@tauri-apps/plugin-fs')).readFile(input),
      });
      if (mountedRef.current) setFileUrlReports((previous) => [...previous.slice(-7), report]);
    } catch {
      // Diagnostics are deliberately isolated from the production preview path.
    } finally {
      if (mountedRef.current) setFileUrlDiagnosticInFlight((count) => Math.max(0, count - 1));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      backgroundGenerationRef.current += 1;
      logoGenerationRef.current += 1;
      if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
      const background = backgroundRef.current;
      backgroundRef.current = undefined;
      releaseAsset(background);
      const logo = logoRef.current;
      logoRef.current = undefined;
      releaseAsset(logo);
    };
  }, []);

  useEffect(() => {
    const host = previewHostRef.current;
    if (!host) return undefined;
    const resize = () => {
      const asset = backgroundRef.current;
      if (!asset) return;
      setPreviewScale(Math.min(
        (host.clientWidth || 1) / asset.width,
        (host.clientHeight || 1) / asset.height,
        1,
      ));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => observer.disconnect();
  }, [backgroundAsset]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
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
        const engine = await api.getEngineStatus();
        if (!engine.ready) throw new Error(engine.message || '内置转换引擎不可用。');

        void logDiagnostic('info', 'WATERMARK_TASK_LISTENER_INIT', 'starting');
        unlisten = await api.listenTaskEvents((event) => {
          if (cancelled || !mountedRef.current) return;
          if (event.kind !== 'progress') {
            void logDiagnostic('info', 'WATERMARK_TASK_TERMINAL_EVENT', `${event.kind} task=${event.taskId}`);
          }
          setTasks((previous) => previous.map((task) => {
            if (task.id !== event.taskId) return task;
            if (event.kind === 'progress') return { ...task, status: 'running', progress: Math.max(0, Math.min(1, event.progress)) };
            if (event.kind === 'completed') return {
              ...task,
              status: 'success',
              progress: 1,
              outputPath: event.outputPath,
              outputBytes: event.outputBytes,
              error: undefined,
            };
            if (event.kind === 'cancelled') return { ...task, status: 'cancelled', error: undefined };
            return { ...task, status: 'failed', error: event.message || '失败' };
          }));
        });
        if (cancelled || !mountedRef.current) {
          unlisten();
          return;
        }
        apiRef.current = api;
        setEngineReady(true);
        setTaskEventsReady(true);
        setDesktopState('ready');
        void logDiagnostic('info', 'WATERMARK_TASK_LISTENER_READY', 'ready');
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          setDesktopState('failed');
          setMessage(`桌面环境初始化失败：${error instanceof Error ? error.message : '未知错误'}`);
          void logDiagnostic('error', 'WATERMARK_TASK_LISTENER_INIT_FAILED', error, 'task event listener');
        }
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const generation = ++backgroundGenerationRef.current;
    if (!currentFile) {
      replaceBackgroundAsset(undefined);
      setPreviewStatus('idle');
      setPreviewNotice('');
      setPreviewError('');
      return;
    }
    const kind = classifyWatermarkPreview(currentFile);
    if (!isStaticCanvasImage(currentFile)) {
      replaceBackgroundAsset(undefined);
      setPreviewStatus('idle');
      setPreviewError('');
      setPreviewNotice(kind === 'video'
        ? '视频素材不会在水印画布中生成静态预览；可继续加入批处理队列。'
        : /\.gif$/i.test(currentFile)
          ? 'GIF 素材继续使用原有媒体处理流程，不进入静态 Canvas 预览。'
        : '当前文件不支持在水印画布中预览。');
      return;
    }
    setPreviewStatus('loading');
    setPreviewNotice('');
    setPreviewError('');
    void createMaterialAsset({ kind: 'path', path: currentFile })
      .then((asset) => {
        if (!mountedRef.current || generation !== backgroundGenerationRef.current) {
          releaseAsset(asset);
          return;
        }
        replaceBackgroundAsset(asset);
        setPreviewStatus('ready');
      })
      .catch((error) => {
        if (mountedRef.current && generation === backgroundGenerationRef.current) {
          setPreviewStatus('error');
          setPreviewError('无法加载图片。请确认该文件仍存在且可访问，然后重试。');
          void logDiagnostic('error', 'WATERMARK_PREVIEW_LOAD_FAILED', error, 'material-asset preview');
        }
      });
  }, [currentFile, previewRetry, replaceBackgroundAsset]);

  useEffect(() => {
    const generation = ++logoGenerationRef.current;
    if (state.kind !== 'image' || !state.imagePath) {
      replaceLogoAsset(undefined);
      setOverlayError('');
      return;
    }
    setOverlayError('');
    void createMaterialAsset({ kind: 'path', path: state.imagePath })
      .then((asset) => {
        if (!mountedRef.current || generation !== logoGenerationRef.current) {
          releaseAsset(asset);
          return;
        }
        replaceLogoAsset(asset);
      })
      .catch((error) => {
        if (mountedRef.current && generation === logoGenerationRef.current) {
          setOverlayError('无法加载水印图片。请重新选择图片后重试。');
          void logDiagnostic('error', 'WATERMARK_OVERLAY_LOAD_FAILED', error, 'material-asset watermark overlay');
        }
      });
  }, [logoRetry, replaceLogoAsset, state.imagePath, state.kind]);

  useEffect(() => {
    if (currentFile) void recordFileUrlDiagnostic('background', currentFile);
  }, [currentFile, recordFileUrlDiagnostic]);

  useEffect(() => {
    if (state.imagePath) void recordFileUrlDiagnostic('watermark-logo', state.imagePath);
  }, [recordFileUrlDiagnostic, state.imagePath]);

  const startSingle = useCallback(async (task: WatermarkTask) => {
    if (!apiRef.current || !engineReady || !taskEventsReady || activeTaskIdRef.current) return;
    const snapshot = stateRef.current;
    const isImage = isStaticCanvasImage(task.path);
    activeTaskIsLocalRef.current = isImage;
    setActiveTaskId(task.id);
    setTasks((previous) => previous.map((item) => item.id === task.id
      ? { ...item, status: 'running', progress: 0, error: undefined }
      : item));

    try {
      if (isImage) {
        const asset = await createMaterialAsset({ kind: 'path', path: task.path });
        let exportLogoAsset: MaterialAsset | undefined;
        try {
          const localSpec: MaterialSpec = {
            id: 'watermark-export',
            name: 'watermark-export',
            width: asset.width,
            height: asset.height,
            format: imageFormat(task.path),
          };
          const localPreviewState = {
            assetId: asset.id,
            specId: localSpec.id,
            fitMode: 'contain' as const,
            crop: createInitialCropState(asset, localSpec, 'contain'),
          };
          if (snapshot.kind === 'image' && snapshot.imagePath) {
            exportLogoAsset = await createMaterialAsset({ kind: 'path', path: snapshot.imagePath });
          }
          const localConfig = createWorkbenchWatermarkConfig(
            { width: localSpec.width, height: localSpec.height },
            snapshot,
            exportLogoAsset,
          );
          if (!localConfig) throw new Error('无法创建水印渲染配置');
          const canvas = await renderBoardToCanvas({
            asset,
            spec: localSpec,
            previewState: localPreviewState,
            brandLayer: { ...DEFAULT_BRAND_LAYER, logoEnabled: false, cprEnabled: false },
            watermarkConfig: localConfig,
            format: localSpec.format,
          });
          const blob = await canvasToBlob(canvas, localSpec.format);
          const outputPath = await saveBlobToOutputTarget({
            kind: 'desktop-directory',
            path: snapshot.outputDirectory,
            reservedFileNames: outputNamesRef.current,
          }, watermarkOutputName(task.path, localSpec.format), blob);
          if (mountedRef.current) {
            setTasks((previous) => previous.map((item) => item.id === task.id
              ? { ...item, status: 'success', progress: 1, outputPath, outputBytes: blob.size }
              : item));
          }
        } finally {
          releaseAsset(exportLogoAsset);
          releaseAsset(asset);
        }
      } else {
        const options: WatermarkTaskRequestOptions = {
          kind: snapshot.kind,
          text: snapshot.text,
          imagePath: snapshot.imagePath ?? null,
          position: 'bottom-right',
          sizePercent: Math.round(snapshot.scale * 10),
          opacity: snapshot.darkMode ? 0.06 : snapshot.opacity,
          tiled: snapshot.pattern !== 'single',
          pattern: snapshot.pattern,
          density: snapshot.density,
          angle: Math.round(snapshot.rotation),
          darkMode: snapshot.darkMode,
          outputDirectory: snapshot.outputDirectory,
        };
        const accepted = await apiRef.current.startWatermarkTask({
          taskId: task.id,
          inputPath: task.path,
          // Rust accepts the legacy optional fields, but the shared GIF media
          // contract intentionally stays unchanged.
          options: options as WatermarkOptions,
        });
        void logDiagnostic('info', 'WATERMARK_TASK_START_ACCEPTED', `task=${accepted.taskId}`);
      }
    } catch (error) {
      if (mountedRef.current) {
        setTasks((previous) => previous.map((item) => item.id === task.id
          ? { ...item, status: 'failed', error: error instanceof Error ? error.message : String(error) }
          : item));
      }
      void logDiagnostic('error', 'WATERMARK_TASK_START_FAILED', error, `task=${task.id}`);
    }
    // The terminal-task effect owns activeTaskId clearing for both local image
    // and Rust tasks, preventing a state race from starting two queue entries.
  }, [engineReady, taskEventsReady]);

  useEffect(() => {
    const activeId = activeTaskIdRef.current;
    if (!activeId) return;
    const terminal = tasks.find((task) => task.id === activeId && TERMINAL_TASK_STATUSES.has(task.status));
    if (!terminal) return;
    activeTaskIsLocalRef.current = false;
    setActiveTaskId(undefined);
    if (pendingReturnRef.current) {
      pendingReturnRef.current = false;
      onReturn();
      return;
    }
    const next = tasks.find((task) => task.status === 'waiting');
    if (next) queueTimerRef.current = setTimeout(() => { void startSingle(next); }, 0);
  }, [onReturn, startSingle, tasks]);

  const pickFiles = useCallback(async () => {
    const paths = await apiRef.current?.pickWatermarkFiles() ?? [];
    if (!paths.length) return;
    setTasks((previous) => [...previous, ...paths.map((path, index) => ({
      id: `wm-${Date.now()}-${index}`,
      path,
      name: path.replace(/\\/g, '/').split('/').pop() || `文件${index + 1}`,
      status: 'waiting' as const,
      progress: 0,
    }))]);
  }, []);

  const pickOutputDirectory = useCallback(async () => {
    const path = await apiRef.current?.pickOutputDirectory();
    if (!path) return;
    outputNamesRef.current.clear();
    updateProp('outputDirectory', path);
  }, [updateProp]);

  const pickWatermarkImage = useCallback(async () => {
    const path = await apiRef.current?.pickWatermarkImage();
    if (path) updateProp('imagePath', path);
  }, [updateProp]);

  const desktopReady = desktopState === 'ready';
  const canProcess = desktopReady
    && engineReady
    && taskEventsReady
    && Boolean(state.outputDirectory)
    && tasks.some((task) => task.status === 'waiting')
    && !activeTaskId;
  const requestReturn = () => {
    if (activeTaskId || tasks.length || state.outputDirectory || state.text !== DEFAULT_STATE.text) {
      setShowReturnConfirm(true);
    } else {
      onReturn();
    }
  };
  const confirmReturn = async () => {
    if (!activeTaskId) {
      setShowReturnConfirm(false);
      onReturn();
      return;
    }
    if (activeTaskIsLocalRef.current) {
      setMessage('本地图片正在写入，完成后即可返回。');
      return;
    }
    try {
      await apiRef.current?.cancelTask(activeTaskId);
      pendingReturnRef.current = true;
      setShowReturnConfirm(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '取消失败，仍保留当前页面');
    }
  };
  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(fileUrlReports.map(formatFileUrlDiagnostic).join('\n\n'));
    } catch {
      setMessage('无法复制诊断报告，请检查系统剪贴板权限。');
    }
  };

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
            <button className="wm-btn wm-btn-upload" onClick={() => void pickFiles()} disabled={!desktopReady} aria-label="导入图片素材">导入图片</button>
            <div className="wm-file-list">
              {tasks.map((task) => (
                <div key={task.id} className={`wm-file ${task.status}`}>
                  <span className="wm-file-name" title={task.path}>{task.name}</span>
                  {task.status === 'success' ? <span className="wm-file-size">{formatFileSize(task.outputBytes)}</span> : null}
                  {task.status === 'failed' ? <span className="wm-file-err">{task.error}</span> : null}
                  {task.status !== 'running' ? <button className="wm-file-remove" onClick={() => setTasks((previous) => previous.filter((item) => item.id !== task.id))}>×</button> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="wm-section">
            <label className="wm-label">输出目录</label>
            <button className="wm-btn wm-btn-pick" onClick={() => void pickOutputDirectory()} disabled={!desktopReady}>{state.outputDirectory || '选择文件夹'}</button>
          </div>
          {!activeTaskId ? (
            <button className="wm-btn wm-btn-run" disabled={!canProcess} onClick={() => {
              const next = tasks.find((task) => task.status === 'waiting');
              if (next) void startSingle(next);
            }} aria-label="开始添加水印到所有素材">开始添加水印</button>
          ) : (
            <button
              className="wm-btn wm-btn-run"
              style={{ background: 'var(--color-danger)' }}
              disabled={activeTaskIsLocalRef.current}
              title={activeTaskIsLocalRef.current ? '本地图片正在写入，暂不支持取消。' : undefined}
              onClick={() => void apiRef.current?.cancelTask(activeTaskId)}
            >{activeTaskIsLocalRef.current ? '正在写入图片' : '取消处理'}</button>
          )}
          {message ? <p className="wm-error">{message}</p> : null}
        </aside>

        <main
          ref={previewHostRef}
          className="wm-canvas-wrap"
          aria-label="水印预览画布"
          role="img"
          onPointerDown={() => setShowOriginal(true)}
          onPointerUp={() => setShowOriginal(false)}
          onPointerLeave={() => setShowOriginal(false)}
        >
          {backgroundAsset && boardPreviewState ? (
            <BoardCanvas
              asset={backgroundAsset}
              spec={spec}
              previewState={boardPreviewState}
              logoAsset={undefined}
              cprAsset={undefined}
              brandLayer={{ ...DEFAULT_BRAND_LAYER, logoEnabled: false, cprEnabled: false }}
              scale={previewScale}
              watermarkConfig={watermarkConfig}
              hideWatermark={showOriginal}
            />
          ) : null}
          {!currentFile ? <div className="wm-empty-canvas">{
            desktopState === 'initializing'
              ? '桌面环境初始化中…'
              : desktopState === 'unavailable'
                ? '当前环境不支持本地水印处理'
                : desktopState === 'failed'
                  ? '桌面环境初始化失败，请返回工具箱后重试'
                  : '导入素材后在此预览水印效果'
          }</div> : null}
          {previewStatus === 'loading' ? <div className="wm-verify-ok">正在加载图片…</div> : null}
          {previewStatus === 'ready' ? <div className="wm-verify-ok">✓ 图片加载正常</div> : null}
          {previewNotice ? <div className="wm-preview-error"><span>{previewNotice}</span></div> : null}
          {previewError ? <div className="wm-preview-error"><span>{previewError}</span><button onClick={() => setPreviewRetry((value) => value + 1)}>重试</button></div> : null}
          {overlayError ? <div className="wm-preview-error"><span>{overlayError}</span><button onClick={() => setLogoRetry((value) => value + 1)}>重试</button></div> : null}
          <div className="wm-canvas-hint">按住查看原图</div>
        </main>

        <aside className="wm-right" aria-label="水印属性">
          {IS_FILE_URL_DIAGNOSTIC_RC ? (
            <div className="wm-section wm-diagnostic-panel">
              <div className="wm-section-head"><h3>RC 文件 URL 诊断</h3></div>
              {fileUrlDiagnosticInFlight > 0 ? <p className="wm-hint">诊断中…</p> : null}
              <button className="wm-btn wm-btn-pick" disabled={!fileUrlReports.length} onClick={() => void copyDiagnostics()}>复制诊断报告 ({fileUrlReports.length})</button>
              {fileUrlReports.length ? <details>
                <summary>查看最新诊断报告（可手动复制）</summary>
                <textarea
                  readOnly
                  aria-label="最新文件 URL 诊断报告"
                  value={formatFileUrlDiagnostic(fileUrlReports[fileUrlReports.length - 1])}
                  rows={12}
                  style={{ width: '100%', marginTop: 8, resize: 'vertical' }}
                />
              </details> : null}
            </div>
          ) : null}
          <div className="wm-section">
            <div className="wm-section-head"><h3>水印类型</h3></div>
            <div className="wm-segmented">
              <button className={state.kind === 'text' ? 'active' : ''} onClick={() => updateProp('kind', 'text')}>文字</button>
              <button className={state.kind === 'image' ? 'active' : ''} onClick={() => updateProp('kind', 'image')}>图片 Logo</button>
            </div>
          </div>
          {state.kind === 'text' ? (
            <div className="wm-section">
              <label className="wm-prop"><span>内容</span><input value={state.text} onChange={(event) => updateProp('text', event.target.value)} /></label>
              <label className="wm-prop"><span>字体</span><select value={state.fontFamily} onChange={(event) => updateProp('fontFamily', event.target.value)}><option value="Source Han Sans SC">思源黑体</option><option value="PingFang SC">苹方</option><option value="Arial">Arial</option></select></label>
            </div>
          ) : (
            <div className="wm-section"><button className="wm-btn wm-btn-pick" onClick={() => void pickWatermarkImage()}>{state.imagePath?.split('/').pop() || '选择图片'}</button></div>
          )}
          <div className="wm-section">
            <div className="wm-section-head"><h3>位置与变换</h3></div>
            <div className="wm-prop-row">
              <label className="wm-prop"><span>X</span><input type="number" value={Math.round(state.x)} onChange={(event) => updateProp('x', Number(event.target.value))} /></label>
              <label className="wm-prop"><span>Y</span><input type="number" value={Math.round(state.y)} onChange={(event) => updateProp('y', Number(event.target.value))} /></label>
              <button className="wm-btn-sm" onClick={() => { updateProp('x', 0); updateProp('y', 0); }}>居中</button>
            </div>
            <label className="wm-prop"><span>旋转 {state.rotation}°</span><input type="range" min={-180} max={180} value={state.rotation} onChange={(event) => updateProp('rotation', Number(event.target.value))} /></label>
            <label className="wm-prop"><span>缩放 {Math.round(state.scale * 100)}%</span><input type="range" min={20} max={200} value={Math.round(state.scale * 100)} onChange={(event) => updateProp('scale', Number(event.target.value) / 100)} /></label>
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>外观</h3></div>
            <label className="wm-prop"><span>透明度 {Math.round(state.opacity * 100)}%</span><input type="range" min={0} max={100} value={Math.round(state.opacity * 100)} onChange={(event) => updateProp('opacity', Number(event.target.value) / 100)} /></label>
            <label className="wm-prop"><span>颜色</span><input type="color" value={state.color} onChange={(event) => updateProp('color', event.target.value)} /></label>
            {state.kind === 'text' ? <>
              <label className="wm-prop wm-prop-toggle"><input type="checkbox" checked={state.strokeEnabled} onChange={(event) => updateProp('strokeEnabled', event.target.checked)} /><span>描边</span></label>
              {state.strokeEnabled ? <>
                <label className="wm-prop"><span>描边颜色</span><input type="color" value={state.strokeColor} onChange={(event) => updateProp('strokeColor', event.target.value)} /></label>
                <label className="wm-prop"><span>粗细 {state.strokeWidth}px</span><input type="range" min={1} max={8} value={state.strokeWidth} onChange={(event) => updateProp('strokeWidth', Number(event.target.value))} /></label>
              </> : null}
              <label className="wm-prop wm-prop-toggle"><input type="checkbox" checked={state.shadowEnabled} onChange={(event) => updateProp('shadowEnabled', event.target.checked)} /><span>投影</span></label>
              {state.shadowEnabled ? <>
                <label className="wm-prop"><span>投影颜色</span><input type="color" value={state.shadowColor} onChange={(event) => updateProp('shadowColor', event.target.value)} /></label>
                <label className="wm-prop"><span>模糊 {state.shadowBlur}</span><input type="range" min={0} max={20} value={state.shadowBlur} onChange={(event) => updateProp('shadowBlur', Number(event.target.value))} /></label>
                <div className="wm-prop-row">
                  <label className="wm-prop"><span>X偏移</span><input type="number" value={state.shadowOffsetX} onChange={(event) => updateProp('shadowOffsetX', Number(event.target.value))} /></label>
                  <label className="wm-prop"><span>Y偏移</span><input type="number" value={state.shadowOffsetY} onChange={(event) => updateProp('shadowOffsetY', Number(event.target.value))} /></label>
                </div>
              </> : null}
            </> : null}
            <label className="wm-prop wm-prop-toggle"><input type="checkbox" checked={state.darkMode} onChange={(event) => updateProp('darkMode', event.target.checked)} /><span>暗水印（极淡·抗去除）</span></label>
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>平铺</h3></div>
            <label className="wm-prop"><span>排列</span><select value={state.pattern} onChange={(event) => updateProp('pattern', event.target.value as WatermarkPattern)}><option value="single">单个</option><option value="tiled">网格平铺</option><option value="diagonal">斜向砖形</option></select></label>
            {state.pattern !== 'single' ? <>
              <label className="wm-prop"><span>密度</span><select value={state.density} onChange={(event) => updateProp('density', event.target.value as WatermarkDensity)}><option value="low">低</option><option value="medium">中等</option><option value="high">高</option></select></label>
              <div className="wm-prop-row">
                <label className="wm-prop"><span>横向间距</span><input type="number" value={state.spacingX ?? ''} onChange={(event) => updateProp('spacingX', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
                <label className="wm-prop"><span>纵向间距</span><input type="number" value={state.spacingY ?? ''} onChange={(event) => updateProp('spacingY', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
              </div>
            </> : null}
          </div>
        </aside>
      </div>
      {showReturnConfirm ? (
        <ConfirmationDialog
          title={activeTaskId ? '正在处理' : '放弃当前设置？'}
          message={activeTaskId ? '返回前会先取消当前任务，并等待任务终态；取消失败时不会离开当前页面。' : '当前已导入素材或修改设置，放弃后将不会保留本次设置。'}
          confirmLabel={activeTaskId ? '取消任务并返回' : '放弃并返回'}
          destructive
          onCancel={() => setShowReturnConfirm(false)}
          onConfirm={() => void confirmReturn()}
        />
      ) : null}
    </div>
  );
}
