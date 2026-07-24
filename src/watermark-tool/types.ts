export type WatermarkTaskStatus = 'waiting' | 'running' | 'success' | 'failed' | 'cancelled';

export type WatermarkKind = 'text' | 'image';
export type WatermarkPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type WatermarkPattern = 'single' | 'tiled' | 'diagonal';
export type WatermarkDensity = 'low' | 'medium' | 'high';

export type WatermarkOptions = {
  kind: WatermarkKind;
  text: string;
  imagePath?: string;
  position: WatermarkPosition;
  sizePercent: number;
  opacity: number;
  pattern: WatermarkPattern;
  density: WatermarkDensity;
  angle: number;
  darkMode: boolean;
  outputDirectory: string;
};

export type WatermarkTask = {
  id: string;
  inputPath: string;
  name: string;
  status: WatermarkTaskStatus;
  progress: number;
  outputPath?: string;
  outputBytes?: number;
  error?: string;
  options: WatermarkOptions;
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

export const DEFAULT_WATERMARK_OPTIONS: Omit<WatermarkOptions, 'outputDirectory'> = {
  kind: 'text',
  text: '品宣物料工作台',
  position: 'bottom-right',
  sizePercent: 10,
  opacity: 0.50,
  pattern: 'diagonal',
  density: 'medium',
  angle: 45,
  darkMode: false,
};

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function createWatermarkTask(path: string, index: number, options: WatermarkOptions): WatermarkTask {
  const normalizedPath = path.replace(/\\/g, '/');
  const name = normalizedPath.split('/').at(-1) || `文件 ${index + 1}`;
  return {
    id: `wm-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    inputPath: path,
    name,
    status: 'waiting',
    progress: 0,
    options,
  };
}

export function applyWatermarkTaskEvent(tasks: WatermarkTask[], event: MediaTaskEvent): WatermarkTask[] {
  return tasks.map((task) => {
    if (task.id !== event.taskId) return task;
    if (event.kind === 'progress') return { ...task, status: 'running', progress: clampProgress(event.progress) };
    if (event.kind === 'completed') return { ...task, status: 'success', progress: 1, outputPath: event.outputPath, outputBytes: event.outputBytes, error: undefined };
    if (event.kind === 'cancelled') return { ...task, status: 'cancelled', error: undefined };
    return { ...task, status: 'failed', error: event.message };
  });
}
