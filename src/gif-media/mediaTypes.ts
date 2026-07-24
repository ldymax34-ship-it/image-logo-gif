export type MediaTaskStatus = 'waiting' | 'running' | 'success' | 'failed' | 'cancelled';
export type MediaTaskKind = 'gif' | 'watermark';

export type MediaPreset = 'high' | 'target-8mb' | 'fast' | 'original';

export type GifMediaOptions = {
  startSeconds?: number;
  endSeconds?: number;
  width?: number;
  fps: number;
  loop: boolean;
  preset: MediaPreset;
  outputDirectory: string;
};

export type WatermarkKind = 'text' | 'image';
export type WatermarkPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type WatermarkOptions = {
  kind: WatermarkKind;
  text: string;
  imagePath?: string;
  position: WatermarkPosition;
  sizePercent: number;
  opacity: number;
  tiled: boolean;
  outputDirectory: string;
};

export type GifMediaTask = {
  id: string;
  kind: MediaTaskKind;
  inputPath: string;
  name: string;
  status: MediaTaskStatus;
  progress: number;
  outputPath?: string;
  outputBytes?: number;
  error?: string;
  gifOptions?: GifMediaOptions;
  watermarkOptions?: WatermarkOptions;
};

export type MediaEngineStatus = {
  ready: boolean;
  message: string;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
};

export type MediaProbeResult = {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
};

export type PreviewGifRequest = {
  taskId: string;
  inputPath: string;
  startSeconds: number;
  endSeconds: number;
  width?: number;
  fps: number;
  preset: string;
  tempDir: string;
};

export type TimelineRange = {
  startSeconds: number;
  endSeconds: number;
  duration: number;
};

export const MIN_SEGMENT_DURATION = 0.1;

export function clampRange(
  start: number,
  end: number,
  duration: number
): TimelineRange {
  const s = Math.min(Math.max(0, start), Math.max(0, duration - MIN_SEGMENT_DURATION));
  const e = Math.max(Math.min(duration, end), s + MIN_SEGMENT_DURATION);
  return { startSeconds: s, endSeconds: e, duration };
}

export function formatSeconds(total: number): string {
  if (!Number.isFinite(total) || total < 0) return '00:00';
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type MediaTaskEvent =
  | { kind: 'progress'; taskId: string; progress: number }
  | { kind: 'completed'; taskId: string; outputPath: string; outputBytes: number }
  | { kind: 'failed'; taskId: string; message: string }
  | { kind: 'cancelled'; taskId: string };

export const MEDIA_PRESETS: Record<MediaPreset, { label: string; fps: number; width?: number }> = {
  high: { label: '高清', fps: 24 },
  'target-8mb': { label: '8MB 倾向', fps: 15, width: 960 },
  fast: { label: '快速预览', fps: 12, width: 640 },
  original: { label: '原尺寸', fps: 15 }
};

export const DEFAULT_GIF_MEDIA_OPTIONS: Omit<GifMediaOptions, 'outputDirectory'> = {
  fps: MEDIA_PRESETS.high.fps,
  loop: true,
  preset: 'high'
};

export const DEFAULT_WATERMARK_OPTIONS: Omit<WatermarkOptions, 'outputDirectory'> = {
  kind: 'text',
  text: '品宣物料工作台',
  position: 'bottom-right',
  sizePercent: 10,
  opacity: 0.55,
  tiled: false
};

export function createMediaTask(
  path: string,
  index: number,
  kind: MediaTaskKind = 'gif',
  options?: GifMediaOptions | WatermarkOptions
): GifMediaTask {
  const normalizedPath = path.replace(/\\/g, '/');
  const name = normalizedPath.split('/').at(-1) || `媒体任务 ${index + 1}`;
  return {
    id: `media-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    inputPath: path,
    name,
    status: 'waiting',
    progress: 0,
    ...(kind === 'gif' ? { gifOptions: options as GifMediaOptions | undefined } : { watermarkOptions: options as WatermarkOptions | undefined })
  };
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function applyMediaTaskEvent(tasks: GifMediaTask[], event: MediaTaskEvent): GifMediaTask[] {
  return tasks.map((task) => {
    if (task.id !== event.taskId) return task;
    if (event.kind === 'progress') return { ...task, status: 'running', progress: clampProgress(event.progress) };
    if (event.kind === 'completed') return { ...task, status: 'success', progress: 1, outputPath: event.outputPath, outputBytes: event.outputBytes, error: undefined };
    if (event.kind === 'cancelled') return { ...task, status: 'cancelled', error: undefined };
    return { ...task, status: 'failed', error: event.message };
  });
}

export function applyMediaPreset(options: GifMediaOptions, preset: MediaPreset): GifMediaOptions {
  const definition = MEDIA_PRESETS[preset];
  return { ...options, preset, fps: definition.fps, width: definition.width };
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mediaTaskKindLabel(kind: MediaTaskKind): string {
  return kind === 'gif' ? 'GIF 转换' : '可见水印';
}
