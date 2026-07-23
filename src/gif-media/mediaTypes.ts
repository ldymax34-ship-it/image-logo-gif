export type MediaTaskStatus = 'waiting' | 'running' | 'success' | 'failed' | 'cancelled';

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

export type GifMediaTask = {
  id: string;
  inputPath: string;
  name: string;
  status: MediaTaskStatus;
  progress: number;
  outputPath?: string;
  outputBytes?: number;
  error?: string;
};

export type MediaEngineStatus = {
  ready: boolean;
  message: string;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
};

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

export function createMediaTask(path: string, index: number): GifMediaTask {
  const normalizedPath = path.replace(/\\/g, '/');
  const name = normalizedPath.split('/').at(-1) || `媒体任务 ${index + 1}`;
  return {
    id: `media-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    inputPath: path,
    name,
    status: 'waiting',
    progress: 0
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
