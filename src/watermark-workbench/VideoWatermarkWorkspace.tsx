import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Film, FolderOpen, ListPlus, LoaderCircle, Play, Sparkles, Trash2, X } from 'lucide-react';
import { ToolPageHeader } from '../components';
import { Select as AppSelect, trackPointerHighlight } from '../components/ui';
import { ConfirmationDialog } from '../modules/media-workbench/ConfirmationDialog';
import { useOptionalAppRuntime, type AppNavigationTarget } from '../app/AppRuntimeProvider';
import { notify } from '../components/ui/toastBus';
import { WatermarkSlider } from './WatermarkSlider';
import { createExportBatchId, exportStatusStore, formatExportSize } from '../components/export-status/exportStatusStore';
import type { ExportTask } from '../components/export-status/ExportStatus';
import { DEFAULT_CONFIG, WATERMARK_DENSITY_LABELS, type WatermarkAnchor, type WatermarkBusinessConfig } from './WatermarkWorkbench';
import type { WatermarkDensity, WatermarkTextStyle } from '../core/image/watermarkRenderPlan';
import { VideoWatermarkCanvas } from './VideoWatermarkCanvas';
import { videoCanvasSize, videoWatermarkLayers, videoWatermarkPlacements } from './videoWatermarkPlan';
import {
  applyVideoMediaEvent,
  applyVideoWatermarkRecommendation,
  applyVideoQueueEvent,
  allocateVideoDraftOutputPath,
  clampTimestampSeconds,
  createDesktopFileObjectUrl,
  createVideoTask,
  encoderCapabilitySummary,
  encoderModeLabel,
  formatTimecode,
  loadVideoWatermarkApi,
  supportsVideoWatermarkPath,
  toVideoPreviewRequest,
  toVideoWatermarkOptions,
  VIDEO_QUALITY_LABELS,
  VIDEO_TEXT_STYLE_LABELS,
  videoWatermarkRenderSummary,
  type VideoQualityPreset,
  type VideoWatermarkAsset,
  type VideoWatermarkPreviewState,
  type VideoWatermarkStatus,
  type VideoWatermarkTask,
} from './videoWatermarkAdapter';
import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import type { MediaDesktopApi, VideoWatermarkRecommendation, WatermarkEncoderCapability, WatermarkQueueStatusEvent } from '../gif-media/mediaDesktop';
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

function statusClass(status: VideoWatermarkStatus): string {
  return `wm-video-status wm-video-status-${status}`;
}

/** Maps the locally-controlled video status to the shared export-center tone. */
function videoStatusTone(status: VideoWatermarkStatus, submitted: boolean): 'queued' | 'exporting' | 'completed' | 'failed' | 'cancelled' {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'waiting' && !submitted) return 'queued';
  return 'exporting';
}

function isTaskActive(status: VideoWatermarkStatus, submitted: boolean): boolean {
  return videoStatusTone(status, submitted) === 'exporting';
}

function taskStatusLabel(task: VideoWatermarkTask): string {
  if (!task.submitted && task.status === 'waiting') return '等待提交';
  return STATUS_LABELS[task.status];
}

function videoFileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').at(-1) || path;
}

function revokeObjectUrl(url?: string) {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

/** Maps the locally-controlled video task status into the shared export statuses. */
function videoTaskToExportTask(task: VideoWatermarkTask, batchId: string): ExportTask {
  const status: ExportTask['status'] = task.status === 'completed'
    ? 'completed'
    : task.status === 'failed'
      ? 'failed'
      : task.status === 'cancelled'
        ? 'cancelled'
        : task.submitted
          ? 'exporting'
          : 'queued';
  // 共享导出中心显示真实输出文件名（含真实扩展名）；后端尚未给出 outputPath 时
  // 才安全回退到源文件名 + MP4。outputPath 本身原样保留，不改本地队列与路径。
  const exportName = task.outputPath ? videoFileName(task.outputPath) : task.fileName;
  const dot = exportName.lastIndexOf('.');
  return {
    id: task.id,
    batchId,
    source: 'video-watermark',
    name: dot > 0 ? exportName.slice(0, dot) : exportName,
    extension: dot > 0 ? exportName.slice(dot + 1) : 'mp4',
    width: task.metadata?.width,
    height: task.metadata?.height,
    progress: Math.round(task.progress * 100),
    status,
    error: task.error,
    outputPath: task.outputPath,
    size: task.outputBytes != null ? formatExportSize(task.outputBytes) : undefined
  };
}

export function VideoWatermarkWorkspace({
  onReturn,
  injectedApi,
  previewObjectUrlLoader = createDesktopFileObjectUrl,
  onOpenChangelog,
}: {
  onReturn: () => void;
  injectedApi?: MediaDesktopApi;
  previewObjectUrlLoader?: (path: string) => Promise<string>;
  onOpenChangelog?: () => void;
}) {
  const runtime = useOptionalAppRuntime();
  const [api, setApi] = useState<MediaDesktopApi | undefined>(injectedApi);
  const [assets, setAssets] = useState<VideoWatermarkAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>();
  const [tasks, setTasks] = useState<VideoWatermarkTask[]>([]);
  const [outputDirectory, setOutputDirectory] = useState('');
  const [config, setConfig] = useState<WatermarkBusinessConfig>(DEFAULT_CONFIG);
  const [quality, setQuality] = useState<VideoQualityPreset>('high');
  const [preferHardware, setPreferHardware] = useState(true);
  const [capability, setCapability] = useState<WatermarkEncoderCapability>();
  const [recommendation, setRecommendation] = useState<VideoWatermarkRecommendation>();
  const [recommendationState, setRecommendationState] = useState<'applied' | 'customized'>();
  const [pendingNavigation, setPendingNavigation] = useState<AppNavigationTarget>();
  const videoQueueRunRef = useRef<{ taskIds: string[]; notified: boolean }>();

  const hasPendingVideoWork = Boolean(
    tasks.some((task) => task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled')
    || assets.length
    || outputDirectory
    || JSON.stringify(config) !== JSON.stringify(DEFAULT_CONFIG)
  );
  useEffect(() => {
    if (!runtime) return;
    return runtime.registerNavigationGuard((target) => {
      if (!hasPendingVideoWork) return true;
      setPendingNavigation(target);
      return false;
    });
  }, [hasPendingVideoWork, runtime]);

  function leaveTo(target: AppNavigationTarget) {
    setPendingNavigation(undefined);
    if (target === 'media' || target === 'custom') {
      runtime?.setActiveModule(target);
      return;
    }
    runtime?.setActiveTool(target);
  }

  function discardVideoWorkAndLeave(target: AppNavigationTarget) {
    const previewTaskId = previewTaskIdRef.current;
    if (previewTaskId && api) void api.cancelWatermarkPreview(previewTaskId).catch(() => undefined);
    const thumbnailTaskId = thumbnailTaskRef.current?.taskId;
    if (thumbnailTaskId && api) void api.cancelWatermarkPreview(thumbnailTaskId).catch(() => undefined);
    for (const url of [...pinnedThumbnailUrlsRef.current, previewObjectUrlRef.current]) {
      if (url) revokeObjectUrl(url);
    }
    pinnedThumbnailUrlsRef.current.clear();
    previewObjectUrlRef.current = undefined;
    assetFramesRef.current = {};
    assetFrameStatusRef.current = {};
    thumbnailQueueRef.current = [];
    thumbnailTaskRef.current = undefined;
    previewTaskIdRef.current = '';
    setAssetFrames({});
    setAssetFrameStatus({});
    setTasks([]);
    setAssets([]);
    setSelectedAssetId(undefined);
    setOutputDirectory('');
    setConfig(DEFAULT_CONFIG);
    setRecommendation(undefined);
    setRecommendationState(undefined);
    videoQueueRunRef.current = undefined;
    setPendingNavigation(undefined);
    leaveTo(target);
  }
  const [preview, setPreview] = useState<VideoWatermarkPreviewState>({ taskId: '', status: 'idle' });
  const [previewTimestamp, setPreviewTimestamp] = useState(0);
  const [engineReady, setEngineReady] = useState(Boolean(injectedApi) || isDesktopBridgeAvailable());
  const previewTaskIdRef = useRef('');
  const previewObjectUrlRef = useRef<string>();
  const previewRequestSeqRef = useRef(0);
  const recommendationRef = useRef<VideoWatermarkRecommendation>();
  const recommendationStateRef = useRef<'applied' | 'customized'>();
  const lastAutoAssetIdRef = useRef<string>();
  const recommendationAssetIdsRef = useRef(new Set<string>());
  const previewContextRef = useRef<{
    asset?: VideoWatermarkAsset;
    config: WatermarkBusinessConfig;
    timestampSeconds: number;
    columns?: number;
    rows?: number;
  }>({ config: DEFAULT_CONFIG, timestampSeconds: 0 });
  const videoBatchIdRef = useRef(createExportBatchId('video'));

  // Per-asset poster thumbnails reuse the already-extracted clean preview frame
  // object URL. Ownership is tracked explicitly so we never revoke a URL that a
  // thumbnail still renders; replaced preview URLs and every owned URL on
  // unmount are revoked exactly once.
  const previewAssetIdRef = useRef<string>();
  const [assetFrames, setAssetFrames] = useState<Record<string, string>>({});
  const assetFramesRef = useRef<Record<string, string>>({});
  const [assetFrameStatus, setAssetFrameStatus] = useState<Record<string, 'loading' | 'failed'>>({});
  const assetFrameStatusRef = useRef<Record<string, 'loading' | 'failed'>>({});
  const pinnedThumbnailUrlsRef = useRef(new Set<string>());
  const assetsRef = useRef<VideoWatermarkAsset[]>([]);
  const thumbnailQueueRef = useRef<VideoWatermarkAsset[]>([]);
  const thumbnailTaskRef = useRef<{ assetId: string; taskId: string }>();
  const thumbnailRequestSeqRef = useRef(0);
  const previewBusyRef = useRef(false);
  const startNextThumbnailRef = useRef<() => void>(() => undefined);

  // Mirror the locally-controlled queue into the shared export center. Video keeps
  // its own control surface; the store is a read-only projection for the panel.
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    const batchId = videoBatchIdRef.current;
    exportStatusStore.syncBatch(batchId, tasks.map((task) => videoTaskToExportTask(task, batchId)));
  }, [tasks]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0],
    [assets, selectedAssetId],
  );

  useEffect(() => {
    previewContextRef.current = {
      asset: selectedAsset,
      config,
      timestampSeconds: previewTimestamp,
      columns: undefined,
      rows: undefined,
    };
  }, [config, previewTimestamp, selectedAsset]);

  const updateConfig = useCallback(<K extends keyof WatermarkBusinessConfig>(key: K, value: WatermarkBusinessConfig[K]) => {
    setConfig((previous) => ({ ...previous, [key]: value }));
    setRecommendationState('customized');
    recommendationStateRef.current = 'customized';
  }, []);

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
    let cancelled = false;
    void api.getWatermarkEncoderCapability().then((encoder) => {
      if (cancelled) return;
      setCapability(encoder);
      setPreferHardware(encoder.hardwareAvailable);
    }).catch(() => {
      if (!cancelled) setCapability(undefined);
    });
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    let disposed = false;
    let stopTasks: (() => void) | undefined;
    let stopQueue: (() => void) | undefined;
    let stopPreview: (() => void) | undefined;
    void Promise.all([
      api.listenTaskEvents((event: MediaTaskEvent) => {
        setTasks((previous) => applyVideoMediaEvent(previous, event));
      }),
      api.listenWatermarkQueueEvents((event: WatermarkQueueStatusEvent) => {
        setTasks((previous) => applyVideoQueueEvent(previous, event));
      }),
      api.listenWatermarkPreviewEvents((event) => {
        const thumbnailTask = thumbnailTaskRef.current;
        if (thumbnailTask?.taskId === event.taskId) {
          const assetId = thumbnailTask.assetId;
          if (event.status === 'completed' && event.outputPath) {
            void previewObjectUrlLoader(event.outputPath).then((objectUrl) => {
              if (thumbnailTaskRef.current?.taskId !== event.taskId) {
                revokeObjectUrl(objectUrl);
                return;
              }
              assetFramesRef.current = { ...assetFramesRef.current, [assetId]: objectUrl };
              pinnedThumbnailUrlsRef.current.add(objectUrl);
              setAssetFrames((previous) => previous[assetId] ? previous : { ...previous, [assetId]: objectUrl });
              delete assetFrameStatusRef.current[assetId];
              setAssetFrameStatus({ ...assetFrameStatusRef.current });
              thumbnailTaskRef.current = undefined;
              startNextThumbnailRef.current();
            }).catch(() => {
              if (thumbnailTaskRef.current?.taskId !== event.taskId) return;
              thumbnailTaskRef.current = undefined;
              assetFrameStatusRef.current = { ...assetFrameStatusRef.current, [assetId]: 'failed' };
              setAssetFrameStatus({ ...assetFrameStatusRef.current });
              startNextThumbnailRef.current();
            });
          } else if (event.status === 'failed' || event.status === 'cancelled' || event.status === 'rejectedBusy') {
            thumbnailTaskRef.current = undefined;
            assetFrameStatusRef.current = { ...assetFrameStatusRef.current, [assetId]: 'failed' };
            setAssetFrameStatus({ ...assetFrameStatusRef.current });
            startNextThumbnailRef.current();
          }
          return;
        }
        if (event.taskId !== previewTaskIdRef.current) return;
        if (event.status === 'completed' && event.outputPath) {
          const taskId = event.taskId;
          const outputPath = event.outputPath;
          setPreview((previous) => ({
            ...previous,
            taskId,
            status: 'processing',
            outputPath,
            error: undefined,
          }));
          void previewObjectUrlLoader(outputPath).then((objectUrl) => {
            if (previewTaskIdRef.current !== taskId) {
              revokeObjectUrl(objectUrl);
              return;
            }
            const previous = previewObjectUrlRef.current;
            // Keep the current preview frame unless it is pinned as a thumbnail.
            if (previous && !pinnedThumbnailUrlsRef.current.has(previous)) {
              revokeObjectUrl(previous);
            }
            previewObjectUrlRef.current = objectUrl;
            // Claim the first completed clean frame as this asset's poster
            // thumbnail; later scrub frames never displace the stable poster.
            const assetId = previewAssetIdRef.current;
            if (assetId && !assetFramesRef.current[assetId]) {
              assetFramesRef.current = { ...assetFramesRef.current, [assetId]: objectUrl };
              pinnedThumbnailUrlsRef.current.add(objectUrl);
              setAssetFrames((prev) => (prev[assetId] ? prev : { ...prev, [assetId]: objectUrl }));
            }
            setPreview((previewState) => ({
              ...previewState,
              taskId,
              status: 'completed',
              outputPath,
              objectUrl,
              error: undefined,
            }));
            previewBusyRef.current = false;
            startNextThumbnailRef.current();
          }).catch((error) => {
            if (previewTaskIdRef.current !== taskId) return;
            setPreview((previous) => ({
              ...previous,
              taskId,
              status: 'failed',
              outputPath,
              error: error instanceof Error ? error.message : String(error),
            }));
            previewBusyRef.current = false;
            startNextThumbnailRef.current();
          });
        } else {
          setPreview((previous) => ({
            ...previous,
            taskId: event.taskId,
            status: event.status,
            outputPath: event.status === 'completed' ? event.outputPath : previous.outputPath,
            error: event.message,
          }));
          if (event.status === 'failed' || event.status === 'cancelled' || event.status === 'rejectedBusy') {
            previewBusyRef.current = false;
            startNextThumbnailRef.current();
          }
        }
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
      const taskId = previewTaskIdRef.current;
      if (taskId) void api.cancelWatermarkPreview(taskId).catch(() => undefined);
      const thumbnailTaskId = thumbnailTaskRef.current?.taskId;
      if (thumbnailTaskId) void api.cancelWatermarkPreview(thumbnailTaskId).catch(() => undefined);
      // Revoke every owned object URL exactly once: pinned thumbnails plus the
      // live preview frame. `URL.revokeObjectURL` is idempotent, so a URL that
      // is both a thumbnail and the current preview is safe to list twice.
      for (const url of [...pinnedThumbnailUrlsRef.current, previewObjectUrlRef.current]) {
        if (url) revokeObjectUrl(url);
      }
      pinnedThumbnailUrlsRef.current.clear();
      previewObjectUrlRef.current = undefined;
      assetFramesRef.current = {};
      assetFrameStatusRef.current = {};
      thumbnailQueueRef.current = [];
      thumbnailTaskRef.current = undefined;
    };
  }, [api, previewObjectUrlLoader]);

  const startNextThumbnail = useCallback(() => {
    if (!api || !engineReady || previewBusyRef.current || thumbnailTaskRef.current) return;
    let next = thumbnailQueueRef.current.shift();
    while (next && (assetFramesRef.current[next.id] || assetFrameStatusRef.current[next.id] === 'failed')) {
      next = thumbnailQueueRef.current.shift();
    }
    if (!next || !next.metadata) return;

    const taskId = `wm-thumb-${next.id}-${thumbnailRequestSeqRef.current++}`;
    thumbnailTaskRef.current = { assetId: next.id, taskId };
    assetFrameStatusRef.current = { ...assetFrameStatusRef.current, [next.id]: 'loading' };
    setAssetFrameStatus({ ...assetFrameStatusRef.current });
    const request = toVideoPreviewRequest(next, config, '', undefined, 320, 0, undefined, undefined, undefined, true);
    void api.startWatermarkPreview({ ...request, taskId }).catch(() => {
      if (thumbnailTaskRef.current?.taskId !== taskId) return;
      thumbnailTaskRef.current = undefined;
      assetFrameStatusRef.current = { ...assetFrameStatusRef.current, [next.id]: 'failed' };
      setAssetFrameStatus(assetFrameStatusRef.current);
      startNextThumbnailRef.current();
    });
  }, [api, config, engineReady]);

  useEffect(() => {
    startNextThumbnailRef.current = startNextThumbnail;
  }, [startNextThumbnail]);

  const queueMissingThumbnails = useCallback((items: VideoWatermarkAsset[] = assetsRef.current) => {
    const queuedIds = new Set(thumbnailQueueRef.current.map((asset) => asset.id));
    if (thumbnailTaskRef.current) queuedIds.add(thumbnailTaskRef.current.assetId);
    for (const asset of items) {
      if (asset.metadata && !assetFramesRef.current[asset.id] && !queuedIds.has(asset.id)) {
        thumbnailQueueRef.current.push(asset);
        queuedIds.add(asset.id);
        assetFrameStatusRef.current = { ...assetFrameStatusRef.current, [asset.id]: 'loading' };
      }
    }
    setAssetFrameStatus({ ...assetFrameStatusRef.current });
  }, []);

  const runPreview = useCallback(async () => {
    const {
      asset,
      config: currentConfig,
      timestampSeconds,
    } = previewContextRef.current;
    if (!api || !asset || !engineReady) return;
    if (currentConfig.contentKind === 'text' && !currentConfig.text.trim()) {
      previewTaskIdRef.current = '';
      setPreview((previous) => ({ ...previous, taskId: '', status: 'failed', error: '请输入文字水印内容' }));
      return;
    }
    const previousTaskId = previewTaskIdRef.current;
    if (previousTaskId) void api.cancelWatermarkPreview(previousTaskId).catch(() => undefined);
    const thumbnailTaskId = thumbnailTaskRef.current?.taskId;
    if (thumbnailTaskId) void api.cancelWatermarkPreview(thumbnailTaskId).catch(() => undefined);
    thumbnailTaskRef.current = undefined;
    previewBusyRef.current = true;
    previewAssetIdRef.current = asset.id;
    const request = toVideoPreviewRequest(
      asset,
      currentConfig,
      '',
      undefined,
      960,
      timestampSeconds,
      undefined,
      undefined,
      undefined,
      true,
    );
    const taskId = `${request.taskId}-${Date.now()}-${previewRequestSeqRef.current++}`;
    previewTaskIdRef.current = taskId;
    setPreview((previous) => ({ ...previous, taskId, status: 'waiting', error: undefined }));
    try {
      await api.startWatermarkPreview({ ...request, taskId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const busy = errorMessage.includes('正式视频任务正在排队或处理');
      setPreview((previous) => ({
        ...previous,
        taskId,
        status: busy ? 'rejectedBusy' : 'failed',
        error: errorMessage,
      }));
    }
  }, [api, engineReady]);

  const requestPreview = useCallback((timestampSeconds = previewTimestamp) => {
    previewContextRef.current.timestampSeconds = timestampSeconds;
    void runPreview();
  }, [previewTimestamp, runPreview]);

  const reapplyRecommendation = useCallback(async () => {
    if (!api || !selectedAsset?.metadata) return;
    try {
      const nextRecommendation = await api.getVideoWatermarkRecommendation({
        inputPath: selectedAsset.inputPath,
        kind: 'text',
        text: config.text,
        imagePath: undefined,
      });
      setRecommendation(nextRecommendation);
      recommendationRef.current = nextRecommendation;
      setRecommendationState('applied');
      recommendationStateRef.current = 'applied';
      recommendationAssetIdsRef.current.add(selectedAsset.id);
      setConfig(applyVideoWatermarkRecommendation(config, nextRecommendation));
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    }
  }, [api, config, selectedAsset]);

  const recommendForAsset = useCallback(async (
    asset: VideoWatermarkAsset,
    currentConfig: WatermarkBusinessConfig,
  ): Promise<WatermarkBusinessConfig> => {
    if (!api || !asset.metadata || recommendationAssetIdsRef.current.has(asset.id)) {
      return currentConfig;
    }
    try {
      const nextRecommendation = await api.getVideoWatermarkRecommendation({
        inputPath: asset.inputPath,
        kind: 'text',
        text: currentConfig.text,
        imagePath: undefined,
      });
      const nextConfig = applyVideoWatermarkRecommendation(currentConfig, nextRecommendation);
      setRecommendation(nextRecommendation);
      recommendationRef.current = nextRecommendation;
      setRecommendationState('applied');
      recommendationStateRef.current = 'applied';
      recommendationAssetIdsRef.current.add(asset.id);
      return nextConfig;
    } catch {
      recommendationAssetIdsRef.current.add(asset.id);
      setRecommendationState(undefined);
      recommendationStateRef.current = undefined;
      return currentConfig;
    }
  }, [api]);

  const prepareAssetPreview = useCallback(async (asset: VideoWatermarkAsset, timestampSeconds: number) => {
    if (!api || !asset.metadata || !engineReady) return;
    const current = previewContextRef.current.config;
    const nextConfig = await recommendForAsset(asset, current);
    previewContextRef.current = {
      asset,
      config: nextConfig,
      timestampSeconds,
      columns: undefined,
      rows: undefined,
    };
    setConfig(nextConfig);
    void runPreview();
  }, [api, engineReady, recommendForAsset, runPreview]);

  const addVideoPaths = useCallback(async (paths: string[]) => {
    if (!api) return;
    const known = new Set(assets.map((asset) => asset.inputPath));
    const incoming = paths.filter((path) => supportsVideoWatermarkPath(path) && !known.has(path));
    if (!incoming.length) {
      notify('error', '请选择 MP4 或 MOV 视频文件');
      return;
    }
    const newAssets = incoming.map((inputPath, index) => ({
      id: `video-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      inputPath,
      fileName: videoFileName(inputPath),
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
    queueMissingThumbnails(probed);
    const firstProbed = probed[0];
    setSelectedAssetId((previous) => previous ?? firstProbed?.id);
    setPreviewTimestamp(0);

    if (firstProbed && 'metadata' in firstProbed && firstProbed.metadata) {
      lastAutoAssetIdRef.current = firstProbed.id;
      previewContextRef.current.asset = firstProbed;
      void prepareAssetPreview(firstProbed, 0);
    }
  }, [api, assets, prepareAssetPreview, queueMissingThumbnails]);

  useEffect(() => {
    if (!selectedAsset?.metadata || !engineReady || !api) return;
    if (lastAutoAssetIdRef.current === selectedAsset.id) return;
    lastAutoAssetIdRef.current = selectedAsset.id;
    const timestamp = clampTimestampSeconds(previewTimestamp, selectedAsset.metadata.duration);
    previewContextRef.current.timestampSeconds = timestamp;
    setPreviewTimestamp(timestamp);
    void prepareAssetPreview(selectedAsset, timestamp);
  }, [api, engineReady, prepareAssetPreview, previewTimestamp, selectedAsset]);

  const chooseVideos = useCallback(async () => {
    if (!api) return;
    await addVideoPaths(await api.pickVideoFiles());
  }, [addVideoPaths, api]);

  const chooseOutputDirectory = useCallback(async () => {
    if (!api) return;
    const directory = await api.pickOutputDirectory();
    if (directory) setOutputDirectory(directory);
  }, [api]);

  const addAssetsToQueue = useCallback((queueAssets: VideoWatermarkAsset[]) => {
    if (!api || !outputDirectory) {
      notify('error', '请先选择输出文件夹');
      return;
    }
    const usedPaths = new Set(tasks.flatMap((task) => task.outputPath ? [task.outputPath] : []));
    const drafts = queueAssets.map((asset) => {
      const reservedOutputPath = allocateVideoDraftOutputPath(outputDirectory, asset.fileName, usedPaths);
      usedPaths.add(reservedOutputPath);
      const options = toVideoWatermarkOptions(
        config,
        outputDirectory,
        undefined,
        quality,
        preferHardware,
        reservedOutputPath,
        undefined,
        undefined,
        videoWatermarkPlacements(asset, config),
      );
      return createVideoTask(asset, options, reservedOutputPath);
    });
    setTasks((previous) => [...previous, ...drafts]);
  }, [api, config, outputDirectory, preferHardware, quality, recommendation, recommendationState, tasks]);

  const addSelectedToQueue = useCallback(() => {
    if (!selectedAsset) return;
    addAssetsToQueue([selectedAsset]);
  }, [addAssetsToQueue, selectedAsset]);

  const addAllToQueue = useCallback(() => {
    addAssetsToQueue(assets);
  }, [addAssetsToQueue, assets]);

  const startQueue = useCallback(async () => {
    if (!api) return;
    const pending = tasks.filter((task) => !task.submitted && task.status === 'waiting');
    if (!pending.length) return;
    videoQueueRunRef.current = { taskIds: pending.map((task) => task.id), notified: false };
    for (const task of pending) {
      try {
        const started = await api.startWatermarkTask({ taskId: task.id, inputPath: task.inputPath, options: task.options });
        setTasks((previous) => previous.map((item) => item.id === task.id ? { ...item, submitted: true, outputPath: started.outputPath } : item));
      } catch (error) {
        setTasks((previous) => previous.map((item) => item.id === task.id ? { ...item, status: 'failed', error: error instanceof Error ? error.message : String(error) } : item));
      }
    }
  }, [api, tasks]);

  useEffect(() => {
    const run = videoQueueRunRef.current;
    if (!run || run.notified || !run.taskIds.length) return;
    const runTasks = run.taskIds.map((taskId) => tasks.find((task) => task.id === taskId));
    if (runTasks.some((task) => !task || !['completed', 'failed', 'cancelled'].includes(task.status))) return;
    run.notified = true;
    const failed = runTasks.filter((task) => task?.status === 'failed' || task?.status === 'cancelled');
    if (failed.length) {
      notify('error', `视频队列完成：${runTasks.length - failed.length} 个成功，${failed.length} 个失败${failed[0]?.error ? `：${failed[0].error}` : ''}`);
    } else {
      notify('success', `视频队列已完成：${runTasks.length} 个视频`);
    }
  }, [tasks]);

  const cancelTask = useCallback(async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (!task.submitted) {
      setTasks((previous) => previous.filter((item) => item.id !== taskId));
      return;
    }
    if (!api) return;
    await api.cancelTask(taskId).catch((error) => notify('error', error instanceof Error ? error.message : String(error)));
  }, [api, tasks]);

  const removePendingTask = useCallback((taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.submitted) return;
    setTasks((previous) => previous.filter((item) => item.id !== taskId));
  }, [tasks]);

  const clearCompleted = useCallback(() => {
    setTasks((previous) => previous.filter((task) => !['completed', 'failed', 'cancelled'].includes(task.status)));
  }, []);

  const copyOutputPath = useCallback(async (path: string) => {
    try {
      if (!navigator.clipboard) throw new Error('当前环境不支持复制路径');
      await navigator.clipboard.writeText(path);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    }
  }, []);

  const openOutputDirectory = useCallback(async () => {
    if (!api || !outputDirectory) return;
    try {
      await api.openOutputDirectory(outputDirectory);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    }
  }, [api, outputDirectory]);

  const revealOutputFile = useCallback(async (path: string) => {
    if (!api) return;
    try {
      await api.revealOutputFile(path);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    }
  }, [api]);

  const canPreview = Boolean(api && engineReady && selectedAsset);
  const canAddQueue = Boolean(api && engineReady && outputDirectory && assets.length && config.text.trim());
  const canRecommendation = Boolean(api && engineReady && selectedAsset?.metadata && config.text.trim());
  const canStartQueue = tasks.some((task) => !task.submitted && task.status === 'waiting');
  const hasFinishedTasks = tasks.some((task) => ['completed', 'failed', 'cancelled'].includes(task.status));
  const previewUrl = preview.objectUrl;
  const hardwareUnavailable = capability ? !capability.hardwareAvailable : false;
  const desktopAvailable = Boolean(api) || isDesktopBridgeAvailable();
  const previewIsLoading = ['waiting', 'processing'].includes(preview.status)
    || (preview.status === 'completed' && !previewUrl);
  const previewCanvasSize = selectedAsset ? videoCanvasSize(selectedAsset) : { width: 960, height: 540 };
  const previewLayers = useMemo(
    () => selectedAsset ? videoWatermarkLayers(selectedAsset, config) : [],
    [config, selectedAsset],
  );

  return (
    <div className="embedded-tool-wrapper wm-video-workspace">
      <ToolPageHeader
        title="视频水印"
        description="导入视频、预览水印位置并按队列输出 MP4。"
        status="available"
        icon={<Film size={20} strokeWidth={1.6} />}
        onReturn={onReturn}
        showReturn={false}
        onOpenChangelog={onOpenChangelog}
      />
      <section className="wm-video-page">
        <section className="wm-video-source-panel" aria-label="视频素材">
          <div className="panel-heading">
            <h2>视频素材</h2>
            <button type="button" onClick={() => void chooseVideos()} disabled={!api}><FolderOpen size={14} />选择 MP4 / MOV</button>
          </div>
          <div className="asset-list">
            {!assets.length ? (
              <div className="drop-zone pointer-highlight" role="button" tabIndex={api ? 0 : -1} aria-disabled={!api} onPointerMove={trackPointerHighlight} onClick={() => { if (api) void chooseVideos(); }} onKeyDown={(event) => { if (api && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); void chooseVideos(); } }}><Film size={22} aria-hidden="true" /><strong>选择视频文件</strong><span>支持 MP4、MOV；路径和文件名可含中文与空格。</span></div>
            ) : assets.map((asset) => {
              const frameUrl = assetFrames[asset.id];
              return (
                <div key={asset.id} className={`asset-row pointer-highlight wm-video-asset-row ${asset.id === selectedAsset?.id ? 'active' : ''}`} onPointerMove={trackPointerHighlight}>
                  <button type="button" className="asset-select-button" onClick={() => setSelectedAssetId(asset.id)} title={asset.inputPath}>
                    {frameUrl ? (
                      <img className="wm-video-asset-thumb" src={frameUrl} alt="" aria-hidden="true" />
                    ) : (
                      <span className="wm-video-file-icon" aria-hidden="true"><Film size={18} /></span>
                    )}
                    <span className="wm-video-asset-info">
                      <strong className="wm-video-asset-name">{asset.fileName}</strong>
                      <small className="wm-video-asset-meta">{asset.metadata ? `${asset.metadata.width} × ${asset.metadata.height} · ${formatTimecode(asset.metadata.duration)} · ${asset.metadata.hasAudio ? '有声' : '无声'}` : (asset.metadataError ?? '读取媒体信息…')}</small>
                    </span>
                  </button>
                  {asset.metadataError ? <span className="wm-error-dot" title={asset.metadataError}>!</span> : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="wm-video-monitor-panel" aria-label="视频水印预览">
          <div className="panel-heading">
            <h2>水印预览</h2>
            <span className="wm-hint">{selectedAsset?.metadata ? `${selectedAsset.metadata.width} × ${selectedAsset.metadata.height}` : '等待素材'}</span>
          </div>
          <div className="wm-video-preview-frame" aria-label="视频水印静帧预览" aria-live="polite">
            {selectedAsset ? (
              <VideoWatermarkCanvas
                baseFrameUrl={previewUrl}
                width={previewCanvasSize.width}
                height={previewCanvasSize.height}
                layers={previewLayers}
              />
            ) : (
              <div className="wm-empty-canvas">选择视频后在此预览水印效果</div>
            )}
            {previewUrl && previewIsLoading ? (
              <span className="wm-video-preview-loading" aria-label="正在更新预览">
                <LoaderCircle size={18} className="wm-spin" />
              </span>
            ) : null}
            {previewIsLoading ? (
              <span className={`wm-video-preview-badge wm-video-preview-status-${preview.status}`}>
                <LoaderCircle size={14} className="wm-spin" />更新底帧
              </span>
            ) : null}
            {preview.status === 'failed' && preview.error ? <span className="wm-video-preview-error">{preview.error}</span> : null}
          </div>
          <div className="wm-video-timeline">
            <WatermarkSlider
              label="预览时间"
              value={previewTimestamp}
              min={0}
              max={selectedAsset?.metadata?.duration ?? 0}
              step={0.01}
              disabled={!canPreview || !selectedAsset?.metadata}
              onChange={setPreviewTimestamp}
              onCommit={(value) => void requestPreview(value)}
              formatValue={formatTimecode}
            />
            <div className="wm-video-timecode"><span>{formatTimecode(previewTimestamp)}</span><span>{selectedAsset?.metadata ? formatTimecode(selectedAsset.metadata.duration) : '--:--.--'}</span></div>
          </div>
          <p className="wm-hint">拖动仅更新时间；释放后请求该时间点的静帧预览。</p>
        </section>

        <section className="wm-video-export-panel" aria-label="水印设置">
          <div className="panel-heading wm-watermark-settings-heading">
            <div>
              <h2>水印设置</h2>
              <span className="wm-hint">参数实时绘制。</span>
            </div>
            <div className="wm-watermark-settings-actions">
              <button
                type="button"
                onClick={() => void reapplyRecommendation()}
                disabled={!canRecommendation}
                title="根据画面重新推荐平铺"
              >
                <Sparkles size={14} />重新推荐
              </button>
            </div>
          </div>
          <p className={`wm-hint wm-recommendation-state-${recommendationState ?? 'none'}`}>
            {recommendationState === 'applied' && recommendation ? `已应用推荐：${recommendation.reason}` : recommendationState === 'customized' ? '已自定义，推荐不会被后台覆盖' : '导入后会根据画面应用一次推荐'}
          </p>
          <div className="wm-section">
            <label className="wm-prop"><span>内容</span><textarea value={config.text} onChange={(event) => updateConfig('text', event.target.value)} rows={3} wrap="off" /></label>
            <label className="wm-prop"><span>文字样式</span>
              <AppSelect value={config.textStyle} onChange={(value) => updateConfig('textStyle', value as WatermarkTextStyle)} aria-label="文字水印样式" options={[{ value: 'white', label: VIDEO_TEXT_STYLE_LABELS.white }, { value: 'black', label: VIDEO_TEXT_STYLE_LABELS.black }, { value: 'outlined', label: VIDEO_TEXT_STYLE_LABELS.outlined }]} />
            </label>
            <label className="wm-prop"><span>排列方式</span>
              <AppSelect value={config.pattern} onChange={(value) => updateConfig('pattern', value as 'single' | 'brick')} aria-label="视频排列方式" options={[{ value: 'single', label: '单个' }, { value: 'brick', label: '砖型平铺' }]} />
            </label>
            {config.pattern === 'single' ? (
              <div className="wm-video-anchor-grid" role="group" aria-label="视频九宫格锚点">
                {(Object.keys({
                  'top-left': true, 'top-center': true, 'top-right': true,
                  'middle-left': true, center: true, 'middle-right': true,
                  'bottom-left': true, 'bottom-center': true, 'bottom-right': true,
                }) as WatermarkAnchor[]).map((anchor) => (
                  <button key={anchor} type="button" aria-label={anchor} aria-pressed={config.anchor === anchor} className={config.anchor === anchor ? 'active' : ''} onClick={() => updateConfig('anchor', anchor)} />
                ))}
              </div>
            ) : null}
            <WatermarkSlider label="大小" value={config.fontSize} min={1} max={20} step={1} onChange={(value) => updateConfig('fontSize', value)} formatValue={(value) => `${value}%`} />
            <WatermarkSlider label="透明度" value={Math.round(config.opacity * 100)} min={0} max={100} step={1} onChange={(value) => updateConfig('opacity', value / 100)} formatValue={(value) => `${value}%`} />
            <WatermarkSlider label="角度" value={config.rotation} min={-180} max={180} step={1} onChange={(value) => updateConfig('rotation', value)} formatValue={(value) => `${value}°`} />
            {config.pattern !== 'single' ? (
              <label className="wm-prop"><span>平铺密度</span>
                <AppSelect value={config.density} onChange={(value) => updateConfig('density', value as WatermarkDensity)} aria-label="视频平铺密度" options={(Object.keys(WATERMARK_DENSITY_LABELS) as WatermarkDensity[]).map((density) => ({ value: density, label: WATERMARK_DENSITY_LABELS[density] }))} />
              </label>
            ) : null}
          </div>
        </section>

        <section className="wm-video-export-center" aria-label="输出与队列">
          <div className="wm-export-center-head">
            <div className="wm-step-title">
              <h2>输出与队列</h2>
              <span className="wm-hint">选定输出位置与编码，添加队列后启动；设置会冻结到任务中。</span>
            </div>
            <div className="wm-export-center-head-actions">
              <span className="wm-queue-count" aria-label={`队列 ${tasks.length} 项`}>{tasks.length} 项</span>
              <button
                type="button"
                className="primary-button wm-start-queue-cta"
                onClick={() => void startQueue()}
                disabled={!canStartQueue}
                title="按队列顺序提交全部待处理任务"
                aria-label="启动队列"
              >
                <Play size={15} aria-hidden="true" />
                <span>启动队列</span>
              </button>
            </div>
          </div>

          <div className="wm-export-center-config">
            <div className="wm-video-output-picker">
              <span>输出到</span>
              <div className="wm-video-output-actions">
                <button type="button" onClick={() => void chooseOutputDirectory()} disabled={!api} title={outputDirectory || '选择输出文件夹'}>
                  {outputDirectory || '选择输出文件夹'}
                </button>
                <button type="button" className="wm-icon-button" aria-label="打开输出目录" title="打开输出目录" onClick={() => void openOutputDirectory()} disabled={!api || !outputDirectory}>
                  <FolderOpen size={15} />
                </button>
              </div>
            </div>
            <label className="wm-prop"><span>格式</span><AppSelect aria-label="视频输出格式" disabled value="mp4" options={[{ value: 'mp4', label: 'MP4 (H.264)' }]} /></label>
            <label className="wm-prop"><span>质量预设</span>
              <AppSelect value={quality} onChange={(value) => setQuality(value as VideoQualityPreset)} aria-label="视频质量预设" options={[{ value: 'high', label: VIDEO_QUALITY_LABELS.high }, { value: 'balanced', label: VIDEO_QUALITY_LABELS.balanced }, { value: 'compact', label: VIDEO_QUALITY_LABELS.compact }]} />
            </label>
            <div className="wm-prop">
              <span>硬件编码</span>
              <label className="wm-prop-toggle">
                <input type="checkbox" checked={preferHardware} disabled={hardwareUnavailable || !desktopAvailable} onChange={(event) => setPreferHardware(event.target.checked)} />
                <span>使用 GPU 硬件编码</span>
              </label>
            </div>
          </div>
          {!outputDirectory ? <p className="wm-error">尚未选择输出位置；选择目录后才能添加队列。</p> : null}
          <p className="wm-hint">{hardwareUnavailable ? encoderCapabilitySummary(capability) : encoderModeLabel(capability, preferHardware)}{!desktopAvailable ? ' · 打开输出目录仅桌面端可用。' : ''}</p>

          <div className="wm-queue-actions">
            <button type="button" onClick={addSelectedToQueue} disabled={!canAddQueue || !selectedAsset} title="将当前素材加入队列" aria-label="添加当前到队列"><ListPlus size={14} aria-hidden="true" /><span>添加当前到队列</span></button>
            <button type="button" onClick={addAllToQueue} disabled={!canAddQueue || assets.length < 2} title="将所有素材加入队列" aria-label="全部添加到队列"><ListPlus size={14} aria-hidden="true" /><span>全部添加</span></button>
            <button type="button" onClick={clearCompleted} disabled={!hasFinishedTasks} title="清除已完成、失败或已取消的任务" aria-label="清除已完成"><Trash2 size={14} aria-hidden="true" /><span>清除已完成</span></button>
          </div>

          <div className="wm-video-task-list">
            {tasks.length ? tasks.map((task) => {
              const outputFileName = task.outputPath ? videoFileName(task.outputPath) : task.fileName;
              const tone = videoStatusTone(task.status, Boolean(task.submitted));
              const active = isTaskActive(task.status, Boolean(task.submitted));
              const percent = Math.round(task.progress * 100);
              const showProgress = task.submitted && ['probing', 'processing', 'fallback', 'finalizing'].includes(task.status);
              return (
                <div className="wm-video-task-row pointer-highlight" key={task.id} data-tone={tone} onPointerMove={trackPointerHighlight}>
                  <div className="wm-video-task-head">
                    <strong className="wm-video-task-filename" title={task.outputPath ?? task.fileName}>{outputFileName}</strong>
                    <span className={`${statusClass(task.status)} is-${tone}`}>
                      {active ? <LoaderCircle size={12} className="wm-spin" aria-hidden="true" /> : null}
                      <span>{taskStatusLabel(task)}</span>
                      {task.submitted ? <span className="wm-video-task-pct">{percent}%</span> : null}
                    </span>
                    <div className="wm-video-task-actions">
                      {!task.submitted && task.status === 'waiting' ? <button type="button" aria-label={`移除 ${task.fileName}`} title={`移除 ${task.fileName}`} onClick={() => removePendingTask(task.id)}><X size={14} /></button> : null}
                      {task.submitted && ['waiting', 'probing', 'processing', 'fallback', 'finalizing'].includes(task.status) ? <button type="button" aria-label={`取消 ${task.fileName}`} title={`取消 ${task.fileName}`} onClick={() => void cancelTask(task.id)}><X size={14} /></button> : null}
                      {task.outputPath && task.status === 'completed' ? (
                        <>
                          <button type="button" aria-label={`在文件夹中显示 ${task.fileName}`} title={task.outputPath} onClick={() => void revealOutputFile(task.outputPath!)}><FolderOpen size={14} /></button>
                          <button type="button" aria-label={`复制 ${task.fileName} 输出路径`} title={task.outputPath} onClick={() => void copyOutputPath(task.outputPath!)}><Copy size={14} /></button>
                        </>
                      ) : task.status === 'completed' ? <Check size={14} aria-hidden="true" /> : null}
                    </div>
                  </div>
                  {showProgress ? (
                    <div className="wm-task-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                      <div className={`wm-task-progress-bar is-${tone}`} style={{ width: `${percent}%` }} />
                    </div>
                  ) : null}
                  <div className="wm-video-task-meta">
                    <small className="wm-video-task-summary">{videoWatermarkRenderSummary(task.options)}</small>
                    {task.fallbackReason ? <small>{task.fallbackReason}</small> : null}
                    {task.error ? <small className="wm-error">{task.error}</small> : null}
                  </div>
                </div>
              );
            }) : (
              <div className="wm-queue-empty">
                <span>队列为空</span>
                <small>在「水印设置」中调整参数后，点击下方「添加当前到队列」。</small>
              </div>
            )}
          </div>
        </section>
      </section>
      {pendingNavigation && (
        <ConfirmationDialog
          title="放弃当前视频水印工作？"
          message="当前仍有未完成或未输出的视频任务，切换后本地队列与未输出内容会被清空。"
          details={["视频素材、队列草稿与部分设置仅临时保存在本机，未输出内容仍可能丢失。"]}
          cancelLabel="继续编辑"
          confirmLabel="放弃并切换"
          destructive
          onCancel={() => setPendingNavigation(undefined)}
          onConfirm={() => discardVideoWorkAndLeave(pendingNavigation)}
        />
      )}
    </div>
  );
}
