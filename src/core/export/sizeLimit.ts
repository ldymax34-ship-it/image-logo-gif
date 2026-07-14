import type { MaterialSpec } from '../spec/specParser';

export const DEFAULT_MAX_SIZE_KB = 8192;
export const DEFAULT_MIN_JPEG_QUALITY = 0.4;
export const DEFAULT_JPEG_SEARCH_ITERATIONS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getEffectiveMaxSizeKb(spec: MaterialSpec, defaultMaxSizeKb = DEFAULT_MAX_SIZE_KB): number {
  return spec.maxSizeKb ?? defaultMaxSizeKb;
}

export function isOverSizeLimit(bytes: number, maxSizeKb: number): boolean {
  return bytes > maxSizeKb * 1024;
}

export type JpegLimitSuccess = {
  ok: true;
  blob: Blob;
  quality: number;
  compressed: boolean;
};

export type JpegLimitFailure = {
  ok: false;
  minQuality: number;
  size: number;
};

export type JpegLimitResult = JpegLimitSuccess | JpegLimitFailure;

export async function exportJpegWithinLimit({
  encode,
  initialQuality,
  maxBytes,
  minQuality = DEFAULT_MIN_JPEG_QUALITY,
  maxIterations = DEFAULT_JPEG_SEARCH_ITERATIONS
}: {
  encode: (quality: number) => Promise<Blob>;
  initialQuality: number;
  maxBytes: number;
  minQuality?: number;
  maxIterations?: number;
}): Promise<JpegLimitResult> {
  const startQuality = clamp(initialQuality, minQuality, 1);
  const initialBlob = await encode(startQuality);
  if (initialBlob.size <= maxBytes) {
    return { ok: true, blob: initialBlob, quality: startQuality, compressed: false };
  }

  const minimumBlob = await encode(minQuality);
  if (minimumBlob.size > maxBytes) {
    return { ok: false, minQuality, size: minimumBlob.size };
  }

  let bestBlob = minimumBlob;
  let bestQuality = minQuality;
  let lower = minQuality;
  let upper = startQuality;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const candidateQuality = Number(((lower + upper) / 2).toFixed(4));
    if (candidateQuality <= lower || candidateQuality >= upper) break;
    const candidateBlob = await encode(candidateQuality);
    if (candidateBlob.size <= maxBytes) {
      bestBlob = candidateBlob;
      bestQuality = candidateQuality;
      lower = candidateQuality;
    } else {
      upper = candidateQuality;
    }
  }

  return { ok: true, blob: bestBlob, quality: bestQuality, compressed: true };
}
