// ---- Batch Template GIF Compositor types ----

export type BatchTemplateGifMode = 'single-video-multi-template' | 'multi-video-multi-template';

export type VideoFitMode = 'cover' | 'contain';

export type CompressionPreference = 'balanced' | 'clarity' | 'smoothness';

export type ChromaKeyMode = 'green' | 'blue' | 'red' | 'custom';

export type ChromaKeyOptions = {
  mode: ChromaKeyMode;
  color?: string;
  similarity?: number;
  blend?: number;
};

export const CHROMA_COLORS: Record<ChromaKeyMode, string> = {
  green: '#00FF00',
  blue: '#0000FF',
  red: '#FF0000',
  custom: '#FFFFFF',
};

export type TemplateVideoSlot = {
  id: string;
  color: string; // hex
  videoPath: string;
  videoName: string;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
};

export type BatchTemplateGifJob = {
  mode: BatchTemplateGifMode;
  taskFolder?: string;
  templateDir: string;
  templateFiles: string[];
  outputDir: string;
  startSeconds: number;
  endSeconds: number;
  videoDuration: number;
  fitMode: VideoFitMode;
  singleVideoPath?: string;
  singleVideoName?: string;
  videoSlots: TemplateVideoSlot[];
  compression: {
    targetBytes: number;
    preference: CompressionPreference;
    minWidth?: number;
    minFps?: number;
    allowStrongCompression: boolean;
  };
};

export type MediaProbeResult = {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
};

export type MediaEngineStatus = {
  ready: boolean;
  message: string;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
};

export type BatchTaskStatus = 'idle' | 'running' | 'done';

export type TemplateResult = {
  templatePath: string;
  templateName: string;
  outputPath: string;
  outputBytes: number;
  status: 'success' | 'failed';
  error?: string;
};

export type BatchResult = {
  job: BatchTemplateGifJob;
  results: TemplateResult[];
  startedAt: string;
  completedAt?: string;
};

export const TARGET_FILE_BYTES = 7.8 * 1024 * 1024;

export const DEFAULT_COMPRESSION = {
  targetBytes: TARGET_FILE_BYTES,
  preference: 'balanced' as CompressionPreference,
  minWidth: undefined as number | undefined,
  minFps: undefined as number | undefined,
  allowStrongCompression: false,
};

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

export function createEmptyJob(): BatchTemplateGifJob {
  return {
    mode: 'single-video-multi-template',
    templateDir: '',
    templateFiles: [],
    outputDir: '',
    startSeconds: 0,
    endSeconds: 0,
    videoDuration: 0,
    fitMode: 'cover',
    videoSlots: [],
    compression: { ...DEFAULT_COMPRESSION },
  };
}
