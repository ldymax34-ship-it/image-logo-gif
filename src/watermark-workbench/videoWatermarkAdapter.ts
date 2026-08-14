import type {
  MediaDesktopApi,
  WatermarkPreviewRequest,
  WatermarkPreviewStatusEvent,
  WatermarkQueueStatusEvent,
  WatermarkVideoOptions,
} from '../gif-media/mediaDesktop';
import type { MediaProbeResult, MediaTaskEvent } from '../gif-media/mediaTypes';
import type { WatermarkAnchor, WatermarkBusinessConfig } from './WatermarkWorkbench';

export type VideoWatermarkStatus =
  | 'waiting'
  | 'probing'
  | 'processing'
  | 'fallback'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type VideoWatermarkAsset = {
  id: string;
  inputPath: string;
  fileName: string;
  metadata?: MediaProbeResult;
  metadataError?: string;
};

export type VideoWatermarkTask = VideoWatermarkAsset & {
  status: VideoWatermarkStatus;
  progress: number;
  outputPath?: string;
  outputBytes?: number;
  error?: string;
  fallbackReason?: string;
  options: WatermarkVideoOptions;
};

export type VideoWatermarkPreviewState = {
  taskId: string;
  status: WatermarkPreviewStatusEvent['status'] | 'idle';
  outputPath?: string;
  error?: string;
};

export function videoFileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').at(-1) || path;
}

export function supportsVideoWatermarkPath(path: string): boolean {
  return /\.(mp4|mov)$/i.test(path);
}

export function anchorToVideoPosition(anchor: WatermarkAnchor): WatermarkVideoOptions['position'] {
  return anchor;
}

function densityFromSpacing(spacingX: number, spacingY: number): WatermarkVideoOptions['density'] {
  const average = (spacingX + spacingY) / 2;
  if (average <= 150) return 'high';
  if (average >= 280) return 'low';
  return 'medium';
}

export function toVideoWatermarkOptions(
  config: WatermarkBusinessConfig,
  outputDirectory: string,
  logoPath?: string,
): WatermarkVideoOptions {
  if (config.pattern === 'staggered') {
    throw new Error('视频水印暂不支持错位平铺');
  }
  return {
    kind: config.contentKind === 'logo' ? 'image' : 'text',
    text: config.text,
    imagePath: logoPath,
    position: anchorToVideoPosition(config.anchor),
    sizePercent: config.fontSize,
    opacity: config.opacity,
    pattern: config.pattern,
    density: densityFromSpacing(config.spacingX, config.spacingY),
    angle: config.rotation,
    darkMode: false,
    offsetX: config.offsetX,
    offsetY: config.offsetY,
    spacingX: config.spacingX,
    spacingY: config.spacingY,
    phaseOffset: config.phaseOffset,
    outputDirectory,
  };
}

export function toVideoPreviewRequest(
  asset: VideoWatermarkAsset,
  config: WatermarkBusinessConfig,
  outputDirectory: string,
  logoPath: string | undefined,
  width?: number,
): WatermarkPreviewRequest {
  const options = toVideoWatermarkOptions(config, outputDirectory, logoPath);
  return {
    taskId: `wm-preview-${asset.id}`,
    inputPath: asset.inputPath,
    tempDirectory: '',
    kind: options.kind,
    text: options.text,
    imagePath: options.imagePath,
    position: options.position,
    sizePercent: options.sizePercent,
    opacity: options.opacity,
    pattern: options.pattern,
    angle: options.angle,
    offsetX: options.offsetX,
    offsetY: options.offsetY,
    spacingX: options.spacingX,
    spacingY: options.spacingY,
    phaseOffset: options.phaseOffset,
    timestampSeconds: asset.metadata ? Math.min(1, asset.metadata.duration) : 0,
    width: width ?? asset.metadata?.width,
    duration: asset.metadata?.duration,
  };
}

export function createVideoTask(
  asset: VideoWatermarkAsset,
  options: WatermarkVideoOptions,
): VideoWatermarkTask {
  return { ...asset, status: 'waiting', progress: 0, options: { ...options } };
}

export function clampMonotonicProgress(progress: number, previous: number): number {
  if (!Number.isFinite(progress)) return previous;
  return Math.max(previous, Math.min(1, Math.max(0, progress)));
}

export function applyVideoMediaEvent(
  tasks: VideoWatermarkTask[],
  event: MediaTaskEvent,
  terminalIds: Set<string>,
): VideoWatermarkTask[] {
  return tasks.map((task) => {
    if (task.id !== event.taskId) return task;
    if (terminalIds.has(event.taskId) || ['completed', 'failed', 'cancelled'].includes(task.status)) return task;
    if (event.kind === 'progress') {
      return {
        ...task,
        status: 'processing',
        progress: clampMonotonicProgress(event.progress, task.progress),
      };
    }
    terminalIds.add(event.taskId);
    if (event.kind === 'completed') {
      return { ...task, status: 'completed', progress: 1, outputPath: event.outputPath, outputBytes: event.outputBytes, error: undefined };
    }
    if (event.kind === 'cancelled') return { ...task, status: 'cancelled', error: undefined };
    return { ...task, status: 'failed', error: event.message };
  });
}

export function applyVideoQueueEvent(
  tasks: VideoWatermarkTask[],
  event: WatermarkQueueStatusEvent,
): VideoWatermarkTask[] {
  return tasks.map((task) => {
    if (task.id !== event.taskId) return task;
    const status = event.status === 'running' ? 'processing' : event.status as VideoWatermarkStatus;
    const order: Record<VideoWatermarkStatus, number> = {
      waiting: 0, probing: 1, processing: 2, fallback: 3, finalizing: 4, completed: 5, failed: 5, cancelled: 5,
    };
    if (order[task.status] >= 5) return task;
    if (order[status] < order[task.status]) return task;
    return {
      ...task,
      status,
      fallbackReason: status === 'fallback' ? event.reason : task.fallbackReason,
      progress: status === 'completed' ? 1 : task.progress,
    };
  });
}

export function assetUrlForDesktopPath(path: string): string {
  return `asset://localhost/${encodeURIComponent(path)}`;
}

export async function loadVideoWatermarkApi(): Promise<MediaDesktopApi> {
  const { loadMediaDesktopApi } = await import('../gif-media/mediaDesktop');
  return loadMediaDesktopApi();
}
