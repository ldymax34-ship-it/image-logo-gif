export type ImageSize = {
  width: number;
  height: number;
};

export type FitMode = 'cover' | 'contain';

export type FittedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export function assertImageSize(size: ImageSize, label = 'image'): ImageSize {
  const width = Math.round(Number(size.width));
  const height = Math.round(Number(size.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid ${label} size: ${size.width}x${size.height}`);
  }
  return { width, height };
}

export function computeFitScale(source: ImageSize, target: ImageSize, mode: FitMode): number {
  const normalizedSource = assertImageSize(source, 'source');
  const normalizedTarget = assertImageSize(target, 'target');
  const widthScale = normalizedTarget.width / normalizedSource.width;
  const heightScale = normalizedTarget.height / normalizedSource.height;
  return mode === 'cover' ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale);
}

export function computeFitRect(source: ImageSize, target: ImageSize, mode: FitMode = 'cover'): FittedRect {
  const normalizedSource = assertImageSize(source, 'source');
  const normalizedTarget = assertImageSize(target, 'target');
  const scale = computeFitScale(normalizedSource, normalizedTarget, mode);
  const width = normalizedSource.width * scale;
  const height = normalizedSource.height * scale;
  return {
    x: (normalizedTarget.width - width) / 2,
    y: (normalizedTarget.height - height) / 2,
    width,
    height,
    scale
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
