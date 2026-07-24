// ---- Chroma Key interface (reserved for multi-language template) ----

export type ChromaKeyMode = 'disabled' | 'green' | 'blue' | 'custom';

export type ChromaKeyOptions = {
  mode: ChromaKeyMode;
  /** 自定义键色，格式统一为 #RRGGBB。 */
  color?: string;
  /** 颜色相似度，建议范围 0~1；第一版可由底层使用默认值。 */
  similarity?: number;
  /** 边缘柔化，建议范围 0~1；第一版可由底层使用默认值。 */
  blend?: number;
  /** 是否反转遮罩，默认 false。 */
  invert?: boolean;
};

// ---- GIF tool modes ----

export type GifToolMode = 'template' | 'plain';

// ---- Compression preferences ----

export type CompressionPreference = 'balanced' | 'clarity' | 'smoothness';

// ---- Task & options ----

export type GifTaskStatus = 'waiting' | 'running' | 'success' | 'failed' | 'cancelled';

export type GifTaskOptions = {
  startSeconds?: number;
  endSeconds?: number;
  width?: number;
  fps: number;
  outputDirectory: string;
  compressionPreference: CompressionPreference;
  // Advanced (collapsible)
  minWidth?: number;
  minFps?: number;
  allowStrongCompression: boolean;
};

export type GifTask = {
  id: string;
  inputPath: string;
  name: string;
  status: GifTaskStatus;
  progress: number;
  outputPath?: string;
  outputBytes?: number;
  error?: string;
  options: GifTaskOptions;
};

// ---- Template mode types ----

export type TemplateGifComposeRequest = {
  taskId: string;
  videoPath: string;
  templatePaths: string[];
  outputDirectory: string;
  startSeconds: number;
  endSeconds: number;
  fitMode: 'cover' | 'contain';
  chromaKey: ChromaKeyOptions;
  compression: {
    targetBytes: number;
    preference: CompressionPreference;
    minWidth?: number;
    minFps?: number;
    allowStrongCompression: boolean;
  };
};

export type TemplatePreviewRequest = {
  taskId: string;
  videoPath: string;
  templatePath: string;
  timestampSeconds: number;
  fitMode: 'cover' | 'contain';
  chromaKey: ChromaKeyOptions;
  tempDirectory: string;
};

// ---- Engine & probe ----

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

// ---- Events ----

export type MediaTaskEvent =
  | { kind: 'progress'; taskId: string; progress: number }
  | { kind: 'completed'; taskId: string; outputPath: string; outputBytes: number }
  | { kind: 'failed'; taskId: string; message: string }
  | { kind: 'cancelled'; taskId: string };

// ---- Timeline ----

export type TimelineRange = {
  startSeconds: number;
  endSeconds: number;
  duration: number;
};

// ---- Helpers ----

export const MIN_SEGMENT_DURATION = 0.1;
export const TARGET_FILE_BYTES = 7.8 * 1024 * 1024; // ~7.8MB
export const HARD_LIMIT_BYTES = 8 * 1024 * 1024; // 8MB

export const CHROMA_COLORS: Record<Exclude<ChromaKeyMode, 'disabled' | 'custom'>, string> = {
  green: '#00FF00',
  blue: '#0000FF',
};

export const DEFAULT_CHROMA_KEY: ChromaKeyOptions = {
  mode: 'disabled',
};

export const DEFAULT_GIF_TASK_OPTIONS: Omit<GifTaskOptions, 'outputDirectory'> = {
  fps: 24,
  compressionPreference: 'balanced',
  allowStrongCompression: false,
};

export function clampRange(start: number, end: number, duration: number): TimelineRange {
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

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function createGifTask(path: string, index: number, options: GifTaskOptions): GifTask {
  const normalizedPath = path.replace(/\\/g, '/');
  const name = normalizedPath.split('/').at(-1) || `视频 ${index + 1}`;
  return {
    id: `gif-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    inputPath: path,
    name,
    status: 'waiting',
    progress: 0,
    options,
  };
}

export function applyMediaTaskEvent(tasks: GifTask[], event: MediaTaskEvent): GifTask[] {
  return tasks.map((task) => {
    if (task.id !== event.taskId) return task;
    if (event.kind === 'progress') return { ...task, status: 'running', progress: clampProgress(event.progress) };
    if (event.kind === 'completed') return { ...task, status: 'success', progress: 1, outputPath: event.outputPath, outputBytes: event.outputBytes, error: undefined };
    if (event.kind === 'cancelled') return { ...task, status: 'cancelled', error: undefined };
    return { ...task, status: 'failed', error: event.message };
  });
}

export function compressionPreferenceLabel(pref: CompressionPreference): string {
  switch (pref) {
    case 'balanced': return '均衡';
    case 'clarity': return '优先清晰';
    case 'smoothness': return '优先流畅';
  }
}
