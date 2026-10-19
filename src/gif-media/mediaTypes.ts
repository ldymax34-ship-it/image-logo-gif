export type MediaTaskStatus = 'waiting' | 'running' | 'success' | 'failed' | 'cancelled';
export type MediaTaskKind = 'gif' | 'watermark';

export type MediaPreset = 'high' | 'target-8mb' | 'fast' | 'original';

export type GifMediaOptions = {
  startSeconds?: number;
  endSeconds?: number;
  width?: number;
  fps: number;
  loopPlayback: boolean;
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
  hasAudio?: boolean;
};

/** 「计算预览」请求：只做分析与单帧提取，不写输出目录。 */
export type GifAnalysisRequest = {
  taskId: string;
  inputPath: string;
  options: {
    startSeconds?: number;
    endSeconds?: number;
    width?: number;
    fps: number;
    preset: string;
    outputDirectory: string;
    targetBytes?: number;
    mode?: string;
    minWidth?: number;
  };
};

/** 计算预览返回的有效短样本；正式生成在签名一致时复用它。 */
export type GifSampleHint = {
  signature: string;
  width: number;
  seconds: number;
  bytes: number;
};

/**
 * 「计算预览」结果：一张真实输出单帧 + 来自同一编码器短样本的体积估算。
 *
 * 估算按完整片段时长换算，是范围而非承诺；单帧只用于判断细节。
 */
export type GifAnalysis = {
  taskId: string;
  framePath: string;
  outputWidth: number;
  outputHeight: number;
  fps: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  sampleWidth: number;
  sampleSeconds: number;
  sampleBytes: number;
  estimateLowBytes: number;
  estimateBytes: number;
  estimateHighBytes: number;
  budgetBytes: number;
  likelyFits: boolean;
  suggestedWidth?: number | null;
  suggestedSeconds?: number | null;
  sampleSignature: string;
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
  loopPlayback: true,
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
  const def = MEDIA_PRESETS[preset];
  return { ...options, preset, fps: def.fps, width: def.width };
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mediaTaskKindLabel(kind: MediaTaskKind): string {
  return kind === 'gif' ? 'GIF 转换' : '可见水印';
}

/** 「计算 GIF」请求：只传编码参数；结果目录由后端创建和管理。 */
export type GifComputeRequest = {
  taskId: string;
  inputPath: string;
  options: {
    startSeconds?: number;
    endSeconds?: number;
    width?: number;
    fps: number;
    preset: string;
    targetBytes?: number;
    mode?: string;
    minWidth?: number;
    sample?: GifSampleHint;
  };
};

/**
 * 一次「计算 GIF」的真实产物：文件位于后端管理的临时目录，尚未写入导出目录。
 * `width/height/bytes` 读取真实文件；`fps` 是本次请求的设置值，不是实测帧率。
 */
export type ComputedGifResult = {
  taskId: string;
  path: string;
  bytes: number;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  startSeconds: number;
  endSeconds: number;
};

/** 保存已计算 GIF 的结果：path 是最终写入用户目录的位置。 */
export type SavedGifResult = {
  path: string;
  bytes: number;
};

/** 用户取消计算时后端返回的标志性消息；前端据此区分取消与失败。 */
export const GIF_COMPUTE_CANCELLED_MESSAGE = '计算已取消';
