import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import { Check, Copy, Film, FolderOpen, LoaderCircle, Play, X } from 'lucide-react';
import { AssetSidebar, BoardOverview, SpecPanel } from '../components';
import { WatermarkSlider } from './WatermarkSlider';
import type { WatermarkBusinessConfig } from './WatermarkWorkbench';
import {
  applyVideoMediaEvent,
  applyVideoQueueEvent,
  assetUrlForDesktopPath,
  createVideoTask,
  loadVideoWatermarkApi,
  supportsVideoWatermarkPath,
  toVideoPreviewRequest,
  toVideoWatermarkOptions,
  type VideoWatermarkAsset,
  type VideoWatermarkPreviewState,
  type VideoWatermarkStatus,
  type VideoWatermarkTask,
} from './videoWatermarkAdapter';
import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import type { MediaDesktopApi, WatermarkQueueStatusEvent } from '../gif-media/mediaDesktop';
import type { MediaTaskEvent } from '../gif-media/mediaTypes';

const STATUS_LABELS: Record<VideoWatermarkStatus, string> = {
  waiting: '等待中',
  probing: '探测中',
  processing: '处理中',
  fallback: '兼容模式',
  finalizing: '收尾中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const PREVIEW_STATUS_LABELS: Record<VideoWatermarkPreviewState['status'], string> = {
  idle: '未生成', waiting: '等待中', processing: '处理中', completed: '已完成', failed: '失败', cancelled: '已取消', rejectedBusy: '正式任务忙碌',
};

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function statusClass(status: VideoWatermarkStatus): string {
  return `wm-video-status wm-video-status-${status}`;
}

export function VideoWatermarkWorkspace({
  config,
  updateConfig,
  injectedApi,
}: {
  config: WatermarkBusinessConfig;
  updateConfig: <K extends keyof WatermarkBusinessConfig>(key: K, value: WatermarkBusinessConfig[K]) => void;
  injectedApi?: MediaDesktopApi;
}) {
  const [api, setApi] = useState<MediaDesktopApi | undefined>(injectedApi);
  const [assets, setAssets] = useState<VideoWatermarkAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>();
  const [tasks, setTasks] = useState<VideoWatermarkTask[]>([]);
  const [outputDirectory, setOutputDirectory] = useState('');
  const [videoLogoPath, setVideoLogoPath] = useState<string>();
  const [preview, setPreview] = useState<VideoWatermarkPreviewState>({ taskId: '', status: 'idle' });
  const [message, setMessage] = useState('');
  const [engineReady, setEngineReady] = useState(Boolean(injectedApi) || isDesktopBridgeAvailable());
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const previewTaskIdRef = useRef('');
  const terminalIdsRef = useRef(new Set<string>());

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0],
    [assets, selectedAssetId],
  );

  useEffect(() => {
    if (api || injectedApi || !isDesktopBridgeAvailable()) return;
    let cancelled = false;
    void loadVideoWatermarkApi().then(async (loaded) => {
      if (cancelled) return;
      setApi(loaded);
      try {
        const status = await loaded.getEngineStatus();
        if (!cancelled) setEngineReady(status.ready);
      } catch {
        if (!cancelled) setEngineReady(false);
      }
    }).catch(() => { if (!cancelled) setEngineReady(false); });
    return () => { cancelled = true; };
  }, [api, injectedApi]);

  useEffect(() => {
    if (!api) return;
    let disposed = false;
    let stopTasks: (() => void) | undefined;
    let stopQueue: (() => void) | undefined;
    let stopPreview: (() => void) | undefined;
    void Promise.all([
      api.listenTaskEvents((event) => {
        setTasks((previous) => applyVideoMediaEvent(previous, event, terminalIdsRef.current));
      }),
      api.listenWatermarkQueueEvents((event) => {
        setTasks((previous) => applyVideoQueueEvent(previous, event));
      }),
      api.listenWatermarkPreviewEvents((event) => {
        if (event.taskId !== previewTaskIdRef.current) return;
        setPreview({ taskId: event.taskId, status: event.status, outputPath: event.status === 'completed' ? event.outputPath : undefined, error: event.message });
      }),
    ]).then(([taskStop, queueStop, previewStop]) => {
      if (disposed) {
        taskStop(); queueStop(); previewStop();
        return;
      }
      stopTasks = taskStop;
      stopQueue = queueStop;
      stopPreview = previewStop;
    });
    return () => {
      disposed = true;
      stopTasks?.();
      stopQueue?.();
      stopPreview?.();
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      const taskId = previewTaskIdRef.current;
      if (taskId) void api.cancelWatermarkPreview(taskId).catch(() => undefined);
    };
  }, [api]);

  const addVideoPaths = useCallback(async (paths: string[]) => {
    if (!api) return;
    const known = new Set(assets.map((asset) => asset.inputPath));
    const incoming = paths.filter((path) => supportsVideoWatermarkPath(path) && !known.has(path));
    if (!incoming.length) {
      setMessage('请选择 MP4 或 MOV 视频文件');
      return;
    }
    const newAssets = incoming.map((inputPath, index) => ({
      id: `video-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      inputPath,
      fileName: inputPath.replace(/\\/g, '/').split('/').at(-1) || inputPath,
    }));
    setAssets((previous) => [...previous, ...newAssets]);
    setSelectedAssetId((previous) => previous ?? newAssets[0]?.id);
    const probed = await Promise.all(newAssets.map(async (asset) => {
      try {
        return { ...asset, metadata: await api.probeMedia(asset.inputPath) };
      } catch (error) {
        return { ...asset, metadataError: error instanceof Error ? error.message : String(error) };
      }
    }));
    setAssets((previous) => previous.map((asset) => probed.find((item) => item.id === asset.id) ?? asset));
    setMessage('');
  }, [api, assets]);

  const chooseVideos = useCallback(async () => {
    if (!api) return;
    await addVideoPaths(await api.pickVideoFiles());
  }, [addVideoPaths, api]);

  const chooseOutputDirectory = useCallback(async () => {
    if (!api) return;
    const directory = await api.pickOutputDirectory();
    if (directory) setOutputDirectory(directory);
  }, [api]);

  const chooseLogo = useCallback(async () => {
    if (!api) return;
    const path = await api.pickWatermarkImage();
    if (path) setVideoLogoPath(path);
  }, [api]);

  const cancelPreview = useCallback(async () => {
    const taskId = previewTaskIdRef.current;
    if (!api || !taskId) return;
    await api.cancelWatermarkPreview(taskId).catch(() => undefined);
  }, [api]);

  const requestPreview = useCallback(async () => {
    if (!api || !selectedAsset || !engineReady || !outputDirectory) return;
    if (config.contentKind === 'text' && !config.text.trim()) {
      setPreview({ taskId: '', status: 'failed', error: '请输入文字水印内容' });
      return;
    }
    if (config.contentKind === 'logo' && !videoLogoPath) {
      setPreview({ taskId: '', status: 'failed', error: '请选择 Logo 图片' });
      return;
    }
    if (config.pattern === 'staggered') {
      setPreview({ taskId: '', status: 'failed', error: '视频水印暂不支持错位平铺' });
      return;
    }
    const previousTaskId = previewTaskIdRef.current;
    if (previousTaskId) await api.cancelWatermarkPreview(previousTaskId).catch(() => undefined);
    const request = toVideoPreviewRequest(selectedAsset, config, outputDirectory, videoLogoPath, 960);
    const taskId = `${request.taskId}-${Date.now()}`;
    previewTaskIdRef.current = taskId;
    setPreview({ taskId, status: 'waiting' });
    try {
      await api.startWatermarkPreview({ ...request, taskId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const busy = errorMessage.includes('正式视频任务正在排队或处理');
      setPreview({ taskId, status: busy ? 'rejectedBusy' : 'failed', error: errorMessage });
    }
  }, [api, config, engineReady, outputDirectory, selectedAsset, videoLogoPath]);

  const schedulePreview = useCallback((delay = 300) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => void requestPreview(), delay);
  }, [requestPreview]);

  useEffect(() => {
    if (selectedAsset && outputDirectory && engineReady) schedulePreview(0);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [engineReady, outputDirectory, schedulePreview, selectedAsset, videoLogoPath]);

  const enqueueAll = useCallback(async () => {
    if (!api || !assets.length || !outputDirectory) return;
    try {
      const options = toVideoWatermarkOptions(config, outputDirectory, videoLogoPath);
      const frozen = assets.map((asset) => createVideoTask(asset, options));
      terminalIdsRef.current = new Set();
      setTasks(frozen);
      for (const task of frozen) {
        try {
          const started = await api.startWatermarkTask({ taskId: task.id, inputPath: task.inputPath, options: task.options });
          setTasks((previous) => previous.map((item) => item.id === task.id ? { ...item, outputPath: started.outputPath } : item));
        } catch (error) {
          terminalIdsRef.current.add(task.id);
          setTasks((previous) => previous.map((item) => item.id === task.id ? { ...item, status: 'failed', error: error instanceof Error ? error.message : String(error) } : item));
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [api, assets, config, outputDirectory, videoLogoPath]);

  const cancelTask = useCallback(async (taskId: string) => {
    if (!api) return;
    await api.cancelTask(taskId).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [api]);

  const copyOutputPath = useCallback(async (path: string) => {
    await navigator.clipboard?.writeText(path);
    setMessage('已复制输出路径');
  }, []);

  const canEnqueue = Boolean(api && engineReady && outputDirectory && assets.length && config.pattern !== 'staggered' && (config.contentKind === 'text' ? config.text.trim() : videoLogoPath));
  const previewUrl = preview.outputPath ? assetUrlForDesktopPath(preview.outputPath) : undefined;

  return (
    <section className="workspace wm-workspace wm-video-workspace">
      <AssetSidebar ariaLabel="视频素材">
        <div className="panel-heading">
          <h2>视频素材</h2>
          <button type="button" onClick={() => void chooseVideos()} disabled={!api}><FolderOpen size={14} />选择 MP4 / MOV</button>
        </div>
        <div className="asset-list">
          {!assets.length ? <div className="drop-zone"><Film size={22} /><strong>选择视频文件</strong><span>支持 MP4、MOV；路径和文件名可含中文与空格。</span></div> : assets.map((asset) => (
            <div key={asset.id} className={`asset-row ${asset.id === selectedAsset?.id ? 'active' : ''}`}>
              <button type="button" className="asset-select-button" onClick={() => setSelectedAssetId(asset.id)}>
                <span className="wm-video-file-icon"><Film size={18} /></span>
                <span><strong>{asset.fileName}</strong><small>{asset.metadata ? `${asset.metadata.width} × ${asset.metadata.height} · ${formatSeconds(asset.metadata.duration)} · ${asset.metadata.hasAudio ? '有声' : '无声'}` : (asset.metadataError ?? '读取媒体信息…')}</small></span>
              </button>
              {asset.metadataError ? <span className="wm-error-dot" title={asset.metadataError}>!</span> : null}
            </div>
          ))}
        </div>
        <div className="wm-video-output-picker"><span>输出文件夹</span><button type="button" onClick={() => void chooseOutputDirectory()} disabled={!api}>{outputDirectory || '选择文件夹'}</button></div>
        <p className="wm-hint">输出固定为 MP4；正式任务按 FIFO 串行执行。</p>
      </AssetSidebar>

      <BoardOverview
        title="视频水印预览"
        subtitle={selectedAsset?.metadata ? `${selectedAsset.metadata.width} × ${selectedAsset.metadata.height} · ${formatSeconds(selectedAsset.metadata.duration)} · 自动（硬件优先）` : '选择视频后生成静帧预览'}
        exportLabel={tasks.some((task) => task.status === 'processing' || task.status === 'probing') ? '处理中…' : `加入队列${assets.length ? `（${assets.length}）` : ''}`}
        exportAriaLabel="加入视频水印队列"
        disabled={!canEnqueue}
        onExport={() => void enqueueAll()}
        message={message || preview.error}
      >
        <div className="wm-video-preview-frame" aria-label="视频水印静帧预览">
          {previewUrl ? <img src={previewUrl} alt="视频水印预览" /> : selectedAsset ? <div className="wm-video-preview-placeholder"><Play size={26} /><span>{preview.status === 'processing' || preview.status === 'waiting' ? '正在生成静帧预览…' : '调整参数后生成预览'}</span></div> : <div className="wm-empty-canvas">选择视频后在此预览水印效果</div>}
          <span className={`wm-video-preview-badge wm-video-preview-status-${preview.status}`}>
            {preview.status === 'processing' ? <LoaderCircle size={14} className="wm-spin" /> : null}
            {PREVIEW_STATUS_LABELS[preview.status]}
          </span>
        </div>
        <p className="wm-hint">预览仅生成临时 PNG，不会写入正式输出目录。</p>
      </BoardOverview>

      <SpecPanel boardCount={assets.length} title="水印参数" countLabel={selectedAsset ? '当前视频' : '未选择视频'} ariaLabel="视频水印参数">
        <div className="wm-parameter-sections">
          <div className="wm-section">
            <div className="wm-section-head"><h3>水印内容</h3></div>
            <Tabs.Root value={config.contentKind} onValueChange={(value) => updateConfig('contentKind', value as 'text' | 'logo')}>
              <Tabs.List className="wm-tabs-list" aria-label="视频水印内容类型"><Tabs.Trigger className="wm-tabs-trigger" value="text">文字</Tabs.Trigger><Tabs.Trigger className="wm-tabs-trigger" value="logo">Logo</Tabs.Trigger></Tabs.List>
            </Tabs.Root>
            {config.contentKind === 'text' ? <label className="wm-prop"><span>内容</span><textarea value={config.text} onChange={(event) => updateConfig('text', event.target.value)} onBlur={() => schedulePreview()} rows={3} wrap="off" /></label> : <button type="button" className="wm-btn wm-btn-pick" onClick={() => void chooseLogo()} disabled={!api}>{videoLogoPath ? videoLogoPath.replace(/\\/g, '/').split('/').at(-1) : '选择 Logo 图片'}</button>}
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>排列与外观</h3></div>
            {config.pattern === 'staggered' ? <p className="wm-error">视频暂不支持错位平铺，请切换到图片模式调整。</p> : <label className="wm-prop"><span>排列方式</span><Select.Root value={config.pattern} onValueChange={(value) => { updateConfig('pattern', value as 'single' | 'tiled'); schedulePreview(); }}><Select.Trigger className="wm-select-trigger" aria-label="视频排列方式"><Select.Value /></Select.Trigger><Select.Portal><Select.Content className="wm-select-content"><Select.Viewport><Select.Item value="single"><Select.ItemText>单个</Select.ItemText></Select.Item><Select.Item value="tiled"><Select.ItemText>规则平铺</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root></label>}
            {config.pattern === 'single' ? <div className="wm-video-anchor-grid" role="group" aria-label="视频九宫格锚点">
              {(['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const).map((anchor) => (
                <button key={anchor} type="button" aria-label={anchor} aria-pressed={config.anchor === anchor} className={config.anchor === anchor ? 'active' : ''} onClick={() => updateConfig('anchor', anchor)} />
              ))}
            </div> : null}
            {config.pattern === 'single' ? <div className="wm-prop-grid"><WatermarkSlider label="X" value={config.offsetX} min={-960} max={960} step={1} onChange={(value) => updateConfig('offsetX', value)} onCommit={() => schedulePreview()} formatValue={(value) => `${value}px`} /><WatermarkSlider label="Y" value={config.offsetY} min={-540} max={540} step={1} onChange={(value) => updateConfig('offsetY', value)} onCommit={() => schedulePreview()} formatValue={(value) => `${value}px`} /></div> : null}
            <WatermarkSlider label="大小" value={config.fontSize} min={1} max={20} step={1} onChange={(value) => updateConfig('fontSize', value)} onCommit={() => schedulePreview()} formatValue={(value) => `${value}%`} />
            <WatermarkSlider label="透明度" value={Math.round(config.opacity * 100)} min={0} max={100} step={1} onChange={(value) => updateConfig('opacity', value / 100)} onCommit={() => schedulePreview()} formatValue={(value) => `${value}%`} />
            <WatermarkSlider label="角度" value={config.rotation} min={-180} max={180} step={1} onChange={(value) => updateConfig('rotation', value)} onCommit={() => schedulePreview()} formatValue={(value) => `${value}°`} />
            {config.pattern !== 'single' ? <><WatermarkSlider label="横向间距" value={config.spacingX} min={40} max={480} step={10} onChange={(value) => updateConfig('spacingX', value)} onCommit={() => schedulePreview()} formatValue={(value) => `${value}px`} /><WatermarkSlider label="纵向间距" value={config.spacingY} min={40} max={480} step={10} onChange={(value) => updateConfig('spacingY', value)} onCommit={() => schedulePreview()} formatValue={(value) => `${value}px`} /></> : null}
          </div>
          <div className="wm-section">
            <div className="wm-section-head"><h3>视频任务</h3></div>
            <p className="wm-hint">编码器：自动（硬件优先）；CPU 水印滤镜与 AAC 音频保持不变。</p>
            <div className="wm-video-task-list" aria-label="视频水印任务列表">
              {tasks.length ? tasks.map((task) => <div className="wm-video-task-row" key={task.id}><div><strong>{task.fileName}</strong><span className={statusClass(task.status)}>{STATUS_LABELS[task.status]} {Math.round(task.progress * 100)}%</span>{task.fallbackReason ? <small>{task.fallbackReason}</small> : null}{task.error ? <small className="wm-error">{task.error}</small> : null}{task.outputPath ? <small className="wm-output-path">{task.outputPath}</small> : null}</div><div className="wm-video-task-actions">{task.status === 'waiting' || task.status === 'processing' || task.status === 'probing' ? <button type="button" aria-label={`取消 ${task.fileName}`} onClick={() => void cancelTask(task.id)}><X size={14} /></button> : task.outputPath && task.status === 'completed' ? <button type="button" aria-label={`复制 ${task.fileName} 输出路径`} onClick={() => void copyOutputPath(task.outputPath!)}><Copy size={14} /></button> : <Check size={14} aria-hidden="true" />}</div></div>) : <span className="wm-hint">尚未入队</span>}
            </div>
          </div>
        </div>
      </SpecPanel>
    </section>
  );
}
