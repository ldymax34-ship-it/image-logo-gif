import { assertImageSize, computeFitRect, computeFitScale, type FitMode, type ImageSize } from './fit';

export type CropState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type CropTransform = CropState & {
  width: number;
  height: number;
};

export type BoardPreviewState = {
  assetId: string;
  specId: string;
  crop: CropState;
  fitMode: FitMode;
};

export function getBoardPreviewKey(assetId: string, specId: string): string {
  return `${assetId}:${specId}`;
}

export function createInitialCropState(source: ImageSize, target: ImageSize, mode: FitMode = 'cover'): CropState {
  const rect = computeFitRect(source, target, mode);
  return {
    scale: rect.scale,
    offsetX: rect.x,
    offsetY: rect.y
  };
}

export function computeCropTransform(source: ImageSize, target: ImageSize, crop: CropState): CropTransform {
  const normalizedSource = assertImageSize(source, 'source');
  assertImageSize(target, 'target');
  const scale = Number.isFinite(crop.scale) && crop.scale > 0 ? crop.scale : computeFitScale(source, target, 'cover');
  return {
    scale,
    offsetX: Number.isFinite(crop.offsetX) ? crop.offsetX : 0,
    offsetY: Number.isFinite(crop.offsetY) ? crop.offsetY : 0,
    width: normalizedSource.width * scale,
    height: normalizedSource.height * scale
  };
}

export function clampCropState(
  source: ImageSize,
  target: ImageSize,
  crop: CropState,
  mode: FitMode = 'cover',
  maxScaleMultiplier = 6
): CropState {
  const normalizedSource = assertImageSize(source, 'source');
  const normalizedTarget = assertImageSize(target, 'target');
  const coverScale = computeFitScale(normalizedSource, normalizedTarget, 'cover');
  const containScale = computeFitScale(normalizedSource, normalizedTarget, 'contain');
  const minScale = mode === 'cover' ? coverScale : containScale;
  const maxScale = Math.max(minScale, coverScale * maxScaleMultiplier);
  const scale = Math.min(maxScale, Math.max(minScale, Number.isFinite(crop.scale) ? crop.scale : minScale));
  const width = normalizedSource.width * scale;
  const height = normalizedSource.height * scale;

  if (mode === 'contain' && (width <= normalizedTarget.width || height <= normalizedTarget.height)) {
    return {
      scale,
      offsetX: (normalizedTarget.width - width) / 2,
      offsetY: (normalizedTarget.height - height) / 2
    };
  }

  const minX = Math.min(0, normalizedTarget.width - width);
  const maxX = Math.max(0, normalizedTarget.width - width);
  const minY = Math.min(0, normalizedTarget.height - height);
  const maxY = Math.max(0, normalizedTarget.height - height);

  return {
    scale,
    offsetX: Math.min(maxX, Math.max(minX, Number.isFinite(crop.offsetX) ? crop.offsetX : 0)),
    offsetY: Math.min(maxY, Math.max(minY, Number.isFinite(crop.offsetY) ? crop.offsetY : 0))
  };
}

export function panCropState(
  source: ImageSize,
  target: ImageSize,
  crop: CropState,
  deltaX: number,
  deltaY: number,
  mode: FitMode = 'cover'
): CropState {
  return clampCropState(
    source,
    target,
    {
      scale: crop.scale,
      offsetX: crop.offsetX + deltaX,
      offsetY: crop.offsetY + deltaY
    },
    mode
  );
}

export function zoomCropState(
  source: ImageSize,
  target: ImageSize,
  crop: CropState,
  nextScale: number,
  focalPoint?: { x: number; y: number },
  mode: FitMode = 'cover'
): CropState {
  const current = computeCropTransform(source, target, crop);
  const focal = focalPoint ?? { x: target.width / 2, y: target.height / 2 };
  const sourceX = (focal.x - current.offsetX) / current.scale;
  const sourceY = (focal.y - current.offsetY) / current.scale;
  return clampCropState(
    source,
    target,
    {
      scale: nextScale,
      offsetX: focal.x - sourceX * nextScale,
      offsetY: focal.y - sourceY * nextScale
    },
    mode
  );
}
