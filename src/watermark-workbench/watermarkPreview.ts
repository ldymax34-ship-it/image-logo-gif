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
 * Keeps all asset-protocol and decoder failures in one result channel. The
 * caller owns state updates and must ignore stale results after every await.
 */
export async function loadWatermarkPreview<T>({
  path,
  toAssetUrl,
  fromUrl,
  isCurrent,
}: {
  path: string;
  toAssetUrl: (path: string) => string | Promise<string>;
  fromUrl: (url: string) => Promise<T | null | undefined>;
  isCurrent: () => boolean;
}): Promise<WatermarkPreviewLoadResult<T>> {
  try {
    const url = await toAssetUrl(path);
    if (!isCurrent()) return { status: 'stale' };
    const image = await fromUrl(url);
    if (!isCurrent()) return { status: 'stale' };
    if (!image) throw new Error('图片解码器未返回有效图像');
    return { status: 'ready', image };
  } catch (error) {
    return isCurrent() ? { status: 'error', error } : { status: 'stale' };
  }
}
