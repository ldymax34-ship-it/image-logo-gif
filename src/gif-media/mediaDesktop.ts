import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import type { GifMediaOptions, MediaEngineStatus, MediaTaskEvent, WatermarkOptions } from './mediaTypes';
import type { MediaProbeResult, PreviewGifRequest } from './mediaTypes';

export type WatermarkVideoOptions = {
  kind: 'text' | 'image';
  text: string;
  imagePath?: string;
  position: 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  sizePercent: number;
  opacity: number;
  pattern: 'single' | 'tiled';
  density: 'low' | 'medium' | 'high';
  angle: number;
  darkMode: boolean;
  offsetX: number;
  offsetY: number;
  columns?: number;
  rows?: number;
  placements?: Array<{ xPercent: number; yPercent: number }>;
  textStyle: 'white' | 'black' | 'outlined';
  quality: 'high' | 'balanced' | 'compact';
  preferHardware: boolean;
  reservedOutputPath?: string;
  outputDirectory: string;
};

export type WatermarkPreviewRequest = {
  taskId: string;
  inputPath: string;
  tempDirectory: string;
  kind: 'text' | 'image';
  text: string;
  imagePath?: string;
  position: WatermarkVideoOptions['position'];
  sizePercent: number;
  opacity: number;
  pattern: 'single' | 'tiled';
  density: 'low' | 'medium' | 'high';
  angle?: number;
  offsetX?: number;
  offsetY?: number;
  columns?: number;
  rows?: number;
  placements?: Array<{ xPercent: number; yPercent: number }>;
  textStyle?: 'white' | 'black' | 'outlined';
  cleanFrame?: boolean;
  timestampSeconds?: number;
  width?: number;
  duration?: number;
};

export type WatermarkPreviewStatusEvent = {
  taskId: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'rejectedBusy';
  outputPath?: string;
  message?: string;
};

export type WatermarkQueueStatusEvent = {
  taskId: string;
  status: 'waiting' | 'running' | 'probing' | 'processing' | 'fallback' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
  reason?: string;
};

export type EncoderCapabilityEntry = {
  backend: 'nvenc' | 'amf' | 'qsv' | 'videotoolbox' | 'cpu';
  backendName: 'NVENC' | 'AMF' | 'QSV' | 'VideoToolbox' | 'CPU';
  encoder: string;
  available: boolean;
  reason: string;
};

export type WatermarkEncoderCapability = {
  hardwareAvailable: boolean;
  backendName: 'NVENC' | 'AMF' | 'QSV' | 'VideoToolbox' | 'CPU';
  reason: string;
  candidates: EncoderCapabilityEntry[];
};

export type VideoWatermarkRecommendationRequest = {
  inputPath: string;
  kind: 'text' | 'image';
  text: string;
  imagePath?: string;
};

export type VideoWatermarkRecommendation = {
  sizePercent: number;
  density: 'low' | 'medium' | 'high';
  columns: number;
  rows: number;
  spacingX: number;
  spacingY: number;
  opacity: number;
  angle: number;
  gutterPercent: number;
  reason: string;
};

export type MediaDesktopApi = {
  getEngineStatus: () => Promise<MediaEngineStatus>;
  getWatermarkEncoderCapability: () => Promise<WatermarkEncoderCapability>;
  getVideoWatermarkRecommendation: (request: VideoWatermarkRecommendationRequest) => Promise<VideoWatermarkRecommendation>;
  pickMediaFiles: () => Promise<string[]>;
  pickVideoFiles: () => Promise<string[]>;
  pickWatermarkFiles: () => Promise<string[]>;
  pickWatermarkImage: () => Promise<string | null>;
  pickTemplateFiles: () => Promise<string[]>;
  pickOutputDirectory: () => Promise<string | null>;
  startGifTask: (request: { taskId: string; inputPath: string; options: GifMediaOptions }) => Promise<{ taskId: string; outputPath: string }>;
  startWatermarkTask: (request: { taskId: string; inputPath: string; options: WatermarkOptions | WatermarkVideoOptions }) => Promise<{ taskId: string; outputPath: string }>;
  probeMedia: (inputPath: string) => Promise<MediaProbeResult>;
  previewGifFrame: (request: PreviewGifRequest) => Promise<{ taskId: string; outputPath: string }>;
  cancelPreviewTask: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  listenTaskEvents: (listener: (event: MediaTaskEvent) => void) => Promise<() => void>;
  openOutputDirectory: (directory: string) => Promise<void>;
  revealOutputFile: (path: string) => Promise<void>;
  startWatermarkPreview: (request: WatermarkPreviewRequest) => Promise<{ taskId: string; outputPath: string }>;
  cancelWatermarkPreview: (taskId: string) => Promise<void>;
  listenWatermarkQueueEvents: (listener: (event: WatermarkQueueStatusEvent) => void) => Promise<() => void>;
  listenWatermarkPreviewEvents: (listener: (event: WatermarkPreviewStatusEvent) => void) => Promise<() => void>;
  listenDroppedPaths: (listener: (paths: string[]) => void) => Promise<() => void>;
};

export function isMediaDesktopAvailable(): boolean {
  return isDesktopBridgeAvailable();
}

export type DesktopOpenerAdapter = {
  openPath: (path: string) => Promise<void>;
  revealItemInDir: (path: string) => Promise<void>;
};

export function openOutputDirectoryWithAdapter(
  opener: DesktopOpenerAdapter,
  directory: string,
): Promise<void> {
  return opener.openPath(directory);
}

export function revealOutputFileWithAdapter(
  opener: DesktopOpenerAdapter,
  path: string,
): Promise<void> {
  return opener.revealItemInDir(path);
}

export async function loadMediaDesktopApi(): Promise<MediaDesktopApi> {
  const [{ invoke }, { listen }, { open }, opener] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-opener')
  ]);

  return {
    getEngineStatus: () => invoke<MediaEngineStatus>('media_engine_status'),
    getWatermarkEncoderCapability: () => invoke<WatermarkEncoderCapability>('watermark_encoder_capability'),
    getVideoWatermarkRecommendation: (request) => invoke<VideoWatermarkRecommendation>('video_watermark_recommendation', { request }),
    async pickMediaFiles() {
      const result = await open({
        title: '选择 MP4 或 MOV 文件',
        multiple: true,
        filters: [{ name: '视频文件', extensions: ['mp4', 'mov'] }]
      });
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    },
    async pickVideoFiles() {
      const result = await open({
        title: '选择 MP4 或 MOV 文件',
        multiple: true,
        filters: [{ name: '视频文件', extensions: ['mp4', 'mov'] }]
      });
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    },
    async pickWatermarkFiles() {
      const result = await open({
        title: '选择需要添加水印的文件',
        multiple: true,
        filters: [{ name: '支持的媒体', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov'] }]
      });
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    },
    async pickWatermarkImage() {
      const result = await open({
        title: '选择 Logo 或图片水印',
        multiple: false,
        filters: [{ name: '图片水印', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });
      return typeof result === 'string' ? result : null;
    },
    async pickTemplateFiles() {
      const result = await open({
        title: '选择模板图片（PNG）',
        multiple: true,
        filters: [{ name: '模板图片', extensions: ['png'] }]
      });
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    },
    async pickOutputDirectory() {
      const result = await open({ title: '选择输出文件夹', directory: true, multiple: false });
      return typeof result === 'string' ? result : null;
    },
    startGifTask: (request) => invoke('start_gif_media_task', { request }),
    startWatermarkTask: (request) => invoke('start_watermark_media_task', { request }),
    probeMedia: (inputPath) => invoke('probe_media', { inputPath }),
    previewGifFrame: (request) => invoke('preview_gif_frame', { request }),
    cancelPreviewTask: (taskId) => invoke('cancel_preview_task', { taskId }),
    cancelTask: (taskId) => invoke('cancel_gif_media_task', { taskId }),
    openOutputDirectory: (directory) => openOutputDirectoryWithAdapter(opener, directory),
    revealOutputFile: (path) => revealOutputFileWithAdapter(opener, path),
    startWatermarkPreview: (request) => invoke('start_watermark_preview', { request }),
    cancelWatermarkPreview: (taskId) => invoke('cancel_watermark_preview', { taskId }),
    async listenTaskEvents(listener) {
      return listen<MediaTaskEvent>('gif-media://task', ({ payload }) => listener(payload));
    },
    async listenWatermarkQueueEvents(listener) {
      return listen<WatermarkQueueStatusEvent>('watermark-queue://status', ({ payload }) => listener(payload));
    },
    async listenWatermarkPreviewEvents(listener) {
      return listen<WatermarkPreviewStatusEvent>('watermark-preview://status', ({ payload }) => listener(payload));
    },
    async listenDroppedPaths(listener) {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      return getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'drop') listener(event.payload.paths);
      });
    }
  };
}
