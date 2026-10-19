// ---- Output intents (四种倾向) ----

/**
 * 输出倾向：只决定「超限时如何用宽度换体积」和帧率的默认值。
 *
 * 帧率始终是用户的硬约束，压缩不会改动它；每种预设的帧率都只是首版保守
 * 默认值，不声称是经过视觉验证的最佳值。
 */
export type GifMode = 'balanced' | 'fps' | 'quality' | 'custom';

export type GifModePreset = {
  label: string;
  /** 一句话说明该倾向在预算不足时如何取舍。 */
  summary: string;
  /** 切换倾向时立即生效的默认帧率。 */
  fps: number;
  /** 该倾向下可选的帧率档位；自定义倾向为空，表示用户自由填写。 */
  fpsOptions: number[];
  /** 最低允许宽度相对期望宽度的比例：越大表示越不愿牺牲分辨率。 */
  minWidthRatio: number;
  /** 最低允许宽度的绝对下限。 */
  minWidthFloor: number;
};

export const GIF_MODES: Record<GifMode, GifModePreset> = {
  balanced: {
    label: '均衡',
    summary: '兼顾尺寸与流畅度：默认 10 fps，超限时按需缩小宽度。',
    fps: 10,
    fpsOptions: [8, 10],
    minWidthRatio: 0.5,
    minWidthFloor: 160,
  },
  fps: {
    label: '帧率优先',
    summary: '优先保住所选帧率：默认 15 fps，预算不足时允许更大幅度缩小宽度。',
    fps: 15,
    fpsOptions: [12, 15],
    minWidthRatio: 0.4,
    minWidthFloor: 160,
  },
  quality: {
    label: '画质优先',
    summary: '优先单帧细节：默认 8 fps，用较低帧率给尺寸留预算；不承诺任意素材画质更好。',
    fps: 8,
    fpsOptions: [6, 8],
    minWidthRatio: 0.75,
    minWidthFloor: 240,
  },
  custom: {
    label: '自定义',
    summary: '自己填写帧率、期望宽度与最低允许宽度；后端仍会校验无效范围。',
    fps: 12,
    fpsOptions: [],
    minWidthRatio: 0.5,
    minWidthFloor: 160,
  },
};

export const GIF_MODE_ORDER: GifMode[] = ['balanced', 'fps', 'quality', 'custom'];

export function modePreset(mode: GifMode): GifModePreset {
  return GIF_MODES[mode] ?? GIF_MODES.balanced;
}

export function modeLabel(mode: GifMode): string {
  return modePreset(mode).label;
}

/** 该倾向下最低允许宽度的默认值，永远不超过期望宽度。 */
export function presetMinWidth(mode: GifMode, expectedWidth: number): number {
  const preset = modePreset(mode);
  const width = Math.max(1, Math.round(expectedWidth));
  return Math.min(width, Math.max(preset.minWidthFloor, Math.round(width * preset.minWidthRatio)));
}

// ---- Task & options ----

export type GifTaskStatus = 'waiting' | 'running' | 'success' | 'failed' | 'cancelled';

// 计算预览的线协议类型定义在 media 线协议层，这里只做转出，避免两份形状。
import type { GifAnalysis, GifSampleHint } from '../gif-media/mediaTypes';
export type { GifAnalysis, GifSampleHint };

export type GifTaskOptions = {
  startSeconds?: number;
  endSeconds?: number;
  /** 期望宽度（用户填写）：正式生成先按它编码，不会静默改成建议宽度。 */
  width?: number;
  /** 用户硬约束：压缩过程不会自动改动帧率。 */
  fps: number;
  outputDirectory: string;
  /** 输出倾向：只影响超限时缩小宽度的幅度，不改变帧率或截取时长。 */
  mode: GifMode;
  /** 超限时可缩小到的宽度下限（自定义倾向由用户填写）。 */
  minWidth?: number;
  /** 复用「计算预览」的有效采样结果，避免同一份分析被重复编码。 */
  sample?: GifSampleHint;
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

/**
 * Hard ceiling for one exported GIF: 8,000,000 bytes, i.e. decimal 8 MB.
 *
 * Not 8 MiB (8,388,608 B). The Rust renderer enforces the same constant and
 * never trusts a client-supplied budget to widen it.
 */
export const HARD_LIMIT_BYTES = 8_000_000;

/**
 * Soft byte budget handed to the renderer as `targetBytes`.
 *
 * Must be an integer: the Tauri command deserializes `targetBytes` into a Rust
 * `u64`, and a computed value like `7.8 * 1024 * 1024` (8178892.8) serializes to
 * a JSON float, which the integer field rejects outright. Kept below
 * `HARD_LIMIT_BYTES` so the renderer retries before it ever reaches the ceiling.
 */
export const TARGET_FILE_BYTES = 7_800_000;

/** Decimal 8 MB label shared by the UI copy and failure messages. */
export const HARD_LIMIT_LABEL = '8,000,000 字节（8 MB）';

export const DEFAULT_GIF_TASK_OPTIONS: Omit<GifTaskOptions, 'outputDirectory'> = {
  fps: GIF_MODES.balanced.fps,
  mode: 'balanced',
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

/**
 * Human-readable size using decimal units, matching `HARD_LIMIT_BYTES`.
 *
 * A 8,000,000-byte GIF must read as "8.0 MB", not "7.6 MB" via 1024 arithmetic,
 * otherwise the displayed size looks inconsistent with the stated limit.
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
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

/** 体积估算范围的展示文案；始终标明「估算」。 */
export function formatEstimateRange(low: number, high: number): string {
  return `${formatFileSize(low)} – ${formatFileSize(high)}（估算）`;
}
