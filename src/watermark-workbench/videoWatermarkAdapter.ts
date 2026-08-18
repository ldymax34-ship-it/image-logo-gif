import type {
  MediaDesktopApi,
  WatermarkEncoderCapability,
  WatermarkPreviewRequest,
  WatermarkPreviewStatusEvent,
  WatermarkQueueStatusEvent,
  VideoWatermarkRecommendation,
  WatermarkVideoOptions,
} from '../gif-media/mediaDesktop';
import type { MediaProbeResult, MediaTaskEvent } from '../gif-media/mediaTypes';
import type { WatermarkDensity } from '../core/image/watermarkRenderPlan';
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
  sourceId: string;
  status: VideoWatermarkStatus;
  progress: number;
  outputPath?: string;
  outputBytes?: number;
  error?: string;
  fallbackReason?: string;
  options: WatermarkVideoOptions;
  submitted?: boolean;
};

export type VideoQualityPreset = 'high' | 'balanced' | 'compact';
export type VideoWatermarkDensity = 'low' | 'medium' | 'high';

export type VideoWatermarkPreviewState = {
  taskId: string;
  status: WatermarkPreviewStatusEvent['status'] | 'idle';
  outputPath?: string;
  objectUrl?: string;
  error?: string;
};

export type DesktopFileObjectUrlDeps = {
  readFile?: (path: string) => Promise<Uint8Array>;
  createObjectURL?: (blob: Blob) => string;
};

/**
 * Reads desktop bytes through the existing Tauri fs plugin and turns them
 * into a local Blob object URL. This is the same safe loading boundary used
 * by MaterialAsset; it avoids relying on the asset protocol for arbitrary
 * temporary output paths.
 */
export async function createDesktopFileObjectUrl(
  path: string,
  deps: DesktopFileObjectUrlDeps = {},
): Promise<string> {
  const readFile = deps.readFile ?? (async (target: string) => {
    const { readFile: tauriReadFile } = await import('@tauri-apps/plugin-fs');
    return tauriReadFile(target);
  });
  const bytes = await readFile(path);
  if (!bytes || bytes.byteLength < 8) {
    throw new Error('预览文件为空或不可读取');
  }
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  const validPng = pngSignature.every((value, index) => bytes[index] === value);
  if (!validPng) {
    throw new Error('预览输出不是有效 PNG');
  }
  const createObjectURL = deps.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  return createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
}

export function videoFileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').at(-1) || path;
}

export function supportsVideoWatermarkPath(path: string): boolean {
  return /\.(mp4|mov)$/i.test(path);
}

export const VIDEO_QUALITY_LABELS: Record<VideoQualityPreset, string> = {
  high: '高质量（默认）',
  balanced: '平衡',
  compact: '较小文件',
};

export function clampTimestampSeconds(timestamp: number, duration?: number): number {
  if (!Number.isFinite(timestamp)) return 0;
  const upper = Number.isFinite(duration) && duration !== undefined ? Math.max(0, duration) : Number.MAX_SAFE_INTEGER;
  return Math.min(upper, Math.max(0, timestamp));
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function anchorToVideoPosition(anchor: WatermarkAnchor): WatermarkVideoOptions['position'] {
  return anchor;
}

export function videoWatermarkDensity(config: WatermarkBusinessConfig): VideoWatermarkDensity {
  return DENSITY_TO_VIDEO[config.density] ?? 'medium';
}

export const VIDEO_WATERMARK_DENSITY_LABELS: Record<VideoWatermarkDensity, string> = {
  high: '密集',
  medium: '适中',
  low: '稀疏',
};

/**
 * Concise, non-sensitive render summary for a frozen queue draft. Used to show
 * the user exactly which parameters were snapshotted at enqueue time, so live
 * controls are never mistaken for an already-added task's settings.
 */
export function videoWatermarkRenderSummary(options: WatermarkVideoOptions): string {
  const pattern = options.pattern === 'single' ? '单个' : '砖型';
  const density = VIDEO_WATERMARK_DENSITY_LABELS[options.density] ?? options.density;
  const opacity = `${Math.round(options.opacity * 100)}%`;
  return `${pattern} · ${options.angle}° · ${options.sizePercent}% · ${opacity} · ${density}`;
}

/** Maps the shared `WatermarkDensity` to the legacy FFmpeg density wire value. */
export const DENSITY_TO_VIDEO: Record<WatermarkDensity, VideoWatermarkDensity> = {
  dense: 'high',
  standard: 'medium',
  sparse: 'low',
};

/** Maps the legacy FFmpeg recommendation density back to the shared contract. */
export const VIDEO_TO_DENSITY: Record<VideoWatermarkDensity, WatermarkDensity> = {
  high: 'dense',
  medium: 'standard',
  low: 'sparse',
};

export function toVideoWatermarkOptions(
  config: WatermarkBusinessConfig,
  outputDirectory: string,
  logoPath?: string,
  quality: VideoQualityPreset = 'high',
  preferHardware = true,
  reservedOutputPath?: string,
  columns?: number,
  rows?: number,
  placements?: Array<{ xPercent: number; yPercent: number }>,
): WatermarkVideoOptions {
  return {
    kind: 'text',
    text: config.text,
    imagePath: undefined,
    position: anchorToVideoPosition(config.anchor),
    sizePercent: config.fontSize,
    opacity: config.opacity,
    pattern: config.pattern === 'single' ? 'single' : 'tiled',
    density: videoWatermarkDensity(config),
    angle: config.rotation,
    darkMode: false,
    offsetX: config.offsetX,
    offsetY: config.offsetY,
    columns,
    rows,
    placements,
    quality,
    preferHardware,
    reservedOutputPath,
    outputDirectory,
  };
}

export function allocateVideoDraftOutputPath(
  directory: string,
  fileName: string,
  usedPaths: ReadonlySet<string>,
  existingPaths: ReadonlySet<string> = new Set(),
): string {
  const normalizedDirectory = directory.replace(/\\/g, '/');
  const stem = fileName.replace(/\.[^.]+$/, '');
  let candidate = `${normalizedDirectory}/${stem}_watermarked.mp4`;
  let index = 1;
  while (usedPaths.has(candidate) || existingPaths.has(candidate)) {
    index += 1;
    candidate = `${normalizedDirectory}/${stem}_watermarked_${index}.mp4`;
  }
  return candidate;
}

export function toVideoPreviewRequest(
  asset: VideoWatermarkAsset,
  config: WatermarkBusinessConfig,
  outputDirectory: string,
  logoPath: string | undefined,
  width?: number,
  timestampSeconds?: number,
  columns?: number,
  rows?: number,
  placements?: Array<{ xPercent: number; yPercent: number }>,
  cleanFrame = false,
): WatermarkPreviewRequest {
  const options = toVideoWatermarkOptions(
    config,
    outputDirectory,
    logoPath,
    'high',
    true,
    undefined,
    columns,
    rows,
    placements,
  );
  const duration = asset.metadata?.duration;
  const resolvedTimestamp = clampTimestampSeconds(timestampSeconds ?? 0, duration);
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
    density: options.density,
    angle: options.angle,
    offsetX: options.offsetX,
    offsetY: options.offsetY,
    columns: options.columns,
    rows: options.rows,
    placements: options.placements,
    cleanFrame,
    timestampSeconds: resolvedTimestamp,
    width: width ?? asset.metadata?.width,
    duration: asset.metadata?.duration,
  };
}

export function applyVideoWatermarkRecommendation(
  config: WatermarkBusinessConfig,
  recommendation: VideoWatermarkRecommendation,
): WatermarkBusinessConfig {
  return {
    ...config,
    fontSize: recommendation.sizePercent,
    rotation: recommendation.angle,
    opacity: recommendation.opacity,
    pattern: 'brick',
    density: VIDEO_TO_DENSITY[recommendation.density] ?? 'standard',
    phaseOffset: 0.5,
  };
}

export function createVideoTask(
  asset: VideoWatermarkAsset,
  options: WatermarkVideoOptions,
  outputPath?: string,
): VideoWatermarkTask {
  const id = `wm-job-${asset.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...asset,
    id,
    sourceId: asset.id,
    status: 'waiting',
    progress: 0,
    submitted: false,
    outputPath,
    // Deep-copy the placements array so a later mutation of the caller's options
    // can never drift an already-queued task's snapshot.
    options: { ...options, placements: options.placements?.map((placement) => ({ ...placement })) },
  };
}

export function encoderModeLabel(capability: WatermarkEncoderCapability | undefined, preferHardware: boolean): string {
  if (!preferHardware) return 'CPU 兼容模式';
  if (!capability) return '自动（硬件优先）';
  return capability.hardwareAvailable ? `硬件优先（${capability.backendName}）` : 'CPU 兼容模式';
}

export function clampMonotonicProgress(progress: number, previous: number): number {
  if (!Number.isFinite(progress)) return previous;
  return Math.max(previous, Math.min(1, Math.max(0, progress)));
}

/**
 * Pure reducer for backend media events. Terminal-state protection is derived
 * solely from the task's own status (completed/failed/cancelled are never
 * regressed by a later progress or terminal event), so this function stays
 * referentially transparent. It must not mutate any shared state: mutating a
 * shared terminal-id `Set` here made the updater impure, and React StrictMode's
 * double-invocation of the `setTasks` updater would then drop the final
 * completed transition, leaving a finished job stuck at 99%/finalizing.
 */
export function applyVideoMediaEvent(
  tasks: VideoWatermarkTask[],
  event: MediaTaskEvent,
): VideoWatermarkTask[] {
  return tasks.map((task) => {
    if (task.id !== event.taskId) return task;
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
    if (event.kind === 'progress') {
      return {
        ...task,
        status: 'processing',
        progress: clampMonotonicProgress(event.progress, task.progress),
      };
    }
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
