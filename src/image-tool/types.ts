export type ImageFormat = 'jpeg' | 'webp' | 'png';

export type ImageFormatSpec = {
  id: ImageFormat;
  label: string;
  mime: string;
  extension: string;
  /** JPEG / WebP 用质量参数；PNG 走无损优化，只暴露优化级别。 */
  supportsQuality: boolean;
  note: string;
};

export const IMAGE_FORMATS: Record<ImageFormat, ImageFormatSpec> = {
  jpeg: {
    id: 'jpeg',
    label: 'JPEG',
    mime: 'image/jpeg',
    extension: 'jpg',
    supportsQuality: true,
    note: 'MozJPEG，适合照片；不支持透明背景。',
  },
  webp: {
    id: 'webp',
    label: 'WebP',
    mime: 'image/webp',
    extension: 'webp',
    supportsQuality: true,
    note: '同画质下通常比 JPEG 更小，支持透明背景。',
  },
  png: {
    id: 'png',
    label: 'PNG',
    mime: 'image/png',
    extension: 'png',
    supportsQuality: false,
    note: '无损重编码，不降低颜色；体积通常比 JPEG 大。',
  },
};

export const IMAGE_FORMAT_ORDER: ImageFormat[] = ['jpeg', 'webp', 'png'];

export const DEFAULT_IMAGE_QUALITY = 75;
export const DEFAULT_PNG_LEVEL = 2;
export const PNG_LEVEL_RANGE: [number, number] = [0, 6];
export const QUALITY_RANGE: [number, number] = [1, 100];

/**
 * 单图压缩在内存里按 RGBA 处理，最长边超过该值时先等比缩到这个范围内再编码，
 * 避免超出 WebView 可承受的像素内存。超过时界面必须显式提示。
 */
export const MAX_SOURCE_EDGE = 5000;

/** 返回按最长边限制后的处理尺寸；未超限时返回原尺寸。 */
export function clampedSourceSize(width: number, height: number): { width: number; height: number; clamped: boolean } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= MAX_SOURCE_EDGE) return { width, height, clamped: false };
  const scale = MAX_SOURCE_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    clamped: true,
  };
}

export function isImageFormat(value: unknown): value is ImageFormat {
  return value === 'jpeg' || value === 'webp' || value === 'png';
}

export function formatSpec(format: ImageFormat): ImageFormatSpec {
  return IMAGE_FORMATS[format];
}

export function isSupportedImageFile(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/webp') return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function sourceFileStem(fileName: string): string {
  const trimmed = fileName.trim();
  const base = trimmed.split(/[\\/]/).pop() ?? trimmed;
  const stem = base.replace(/\.[^.]+$/, '');
  return stem.length > 0 ? stem : '图片';
}

/** 默认不覆盖原图：输出名固定追加 `-compressed`，同名由桌面端保存命令追加序号。 */
export function formatOutputName(sourceName: string, format: ImageFormat): string {
  return `${sourceFileStem(sourceName)}-compressed.${formatSpec(format).extension}`;
}

export function clampTargetWidth(width: number | undefined, sourceWidth: number): number | undefined {
  if (width === undefined || Number.isNaN(width)) return undefined;
  if (!Number.isFinite(width) || width <= 0) return undefined;
  const maximum = Math.max(1, Math.min(Math.round(sourceWidth), MAX_SOURCE_EDGE));
  return Math.min(Math.max(1, Math.round(width)), maximum);
}

/**
 * 按原始宽高比换算输出高度：四舍五入取整、最小为 1。
 *
 * 静态图片没有视频编码器的偶数高度要求，JPEG / WebP / PNG 都不强制偶数；
 * 不调整宽度时直接保留原始高度，避免任何取整误差。
 */
export function scaledImageHeight(sourceWidth: number, sourceHeight: number, width: number): number {
  if (sourceWidth <= 0 || sourceHeight <= 0) return Math.max(1, Math.round(width));
  if (width === sourceWidth) return Math.max(1, sourceHeight);
  return Math.max(1, Math.round((width * sourceHeight) / sourceWidth));
}

export function qualityForFormat(format: ImageFormat, quality: number, pngLevel: number): number {
  if (!formatSpec(format).supportsQuality) return pngLevel;
  const [low, high] = QUALITY_RANGE;
  if (!Number.isFinite(quality)) return DEFAULT_IMAGE_QUALITY;
  return Math.min(high, Math.max(low, Math.round(quality)));
}

export function formatImageBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / (1000 * 1000)).toFixed(2)} MB`;
}

/** 相对原图的变化，例如 `-63%`；体积上涨时明确显示 `+4%`。 */
export function sizeChangeLabel(sourceBytes: number, outputBytes: number): string {
  if (sourceBytes <= 0 || !Number.isFinite(outputBytes)) return '—';
  const ratio = (outputBytes - sourceBytes) / sourceBytes;
  const percent = Math.round(ratio * 100);
  if (percent === 0) return '0%';
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

export type EncodeInput = {
  format: ImageFormat;
  quality: number;
  pngLevel: number;
  width: number;
  height: number;
  /** RGBA 像素数据；由主线程解码并在需要时缩放后传入。 */
  data: ArrayBuffer;
};

export type EncodedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  mime: string;
};

export type EncodeResultMessage =
  | { id: number; ok: true; bytes: ArrayBuffer; width: number; height: number; mime: string }
  | { id: number; ok: false; error: string };
