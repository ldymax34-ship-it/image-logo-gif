import { createMaterialAsset, releaseMaterialAsset, type CreateMaterialAssetDeps, type MaterialAsset } from '../core/image/imageMeta';

export type WatermarkPreviewKind = 'image' | 'video' | 'unsupported';

export type WatermarkPreviewLoadResult<T> =
  | { status: 'ready'; image: T }
  | { status: 'stale' }
  | { status: 'error'; error: unknown };

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

export function classifyWatermarkPreview(path: string): WatermarkPreviewKind {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return IMAGE_EXTENSIONS.has(extension) ? 'image' : 'unsupported';
}

/**
 * Loads a local image path into a decoder via the unified MaterialAsset
 * pipeline (readFile → Blob → Object URL → decoder). The caller owns state
 * updates and must ignore stale results after every await. The MaterialAsset
 * is released exactly once in the finally block, regardless of outcome.
 */
export async function loadWatermarkPreview<T>({
  path,
  fromUrl,
  isCurrent,
  deps,
}: {
  path: string;
  fromUrl: (url: string) => Promise<T | null | undefined>;
  isCurrent: () => boolean;
  deps?: CreateMaterialAssetDeps;
}): Promise<WatermarkPreviewLoadResult<T>> {
  let asset: MaterialAsset | undefined;
  try {
    asset = await createMaterialAsset({ kind: 'path', path }, deps);
    if (!isCurrent()) return { status: 'stale' };
    const image = await fromUrl(asset.objectUrl);
    if (!isCurrent()) return { status: 'stale' };
    if (!image) throw new Error('图片解码器未返回有效图像');
    return { status: 'ready', image };
  } catch (error) {
    return isCurrent() ? { status: 'error', error } : { status: 'stale' };
  } finally {
    if (asset) {
      try { releaseMaterialAsset(asset); } catch {}
    }
  }
}
