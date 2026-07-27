export type MaterialAsset = {
  id: string;
  fileName: string;
  objectUrl: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
};

export type WorkbenchState = {
  assets: MaterialAsset[];
  specs: import('../spec').MaterialSpec[];
  selectedAssetId?: string;
  selectedSpecId?: string;
  previewStates: Record<string, import('./crop').BoardPreviewState>;
  brandLayer: import('../brand').BrandLayerState;
};

/**
 * Unified entry for every image that enters the workbench. Logo/版式 imports a
 * browser File; the watermark workbench resolves a local path into bytes. Both
 * funnel through the same Blob → Object URL → decoder → MaterialAsset pipeline.
 */
export type ImageSource =
  | { kind: 'file'; file: File }
  | { kind: 'path'; path: string };

/**
 * Injectable collaborators so the path→bytes→Blob pipeline is testable without
 * a live Tauri runtime. Defaults dynamically import @tauri-apps/plugin-fs and
 * use the browser URL API; readSize defaults to readImageElementSize.
 */
export type CreateMaterialAssetDeps = {
  readFile?: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  readSize?: (src: string) => Promise<{ width: number; height: number }>;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function mimeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function pathBaseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

async function defaultReadFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  return readFile(path);
}

export async function readImageElementSize(src: string): Promise<{ width: number; height: number }> {
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<{ width: number; height: number }>((resolve, reject) => {
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) {
        reject(new Error('无法读取图片尺寸'));
        return;
      }
      resolve({ width, height });
    };
    image.onerror = () => reject(new Error('图片读取失败'));
  });
  image.src = src;
  return loaded;
}

const assetReleaseCallbacks = new WeakMap<MaterialAsset, () => void>();
const releasedAssets = new WeakSet<object>();

export async function createMaterialAsset(
  source: ImageSource,
  deps: CreateMaterialAssetDeps = {},
  id: string = crypto.randomUUID(),
): Promise<MaterialAsset> {
  const createObjectURL = deps.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectURL = deps.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const readSize = deps.readSize ?? readImageElementSize;

  let blob: Blob;
  let fileName: string;
  let fileSize: number;
  let mimeType: string;

  if (source.kind === 'file') {
    const file = source.file;
    if (!file.type.startsWith('image/')) {
      throw new Error(`${file.name} 不是图片文件`);
    }
    blob = file;
    fileName = file.name;
    fileSize = file.size;
    mimeType = file.type;
  } else {
    const path = source.path;
    const readFile = deps.readFile ?? defaultReadFile;
    const bytes = await readFile(path);
    mimeType = mimeForPath(path);
    fileName = pathBaseName(path);
    const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    blob = new Blob([blobBytes], { type: mimeType });
    fileSize = blob.size;
  }

  const objectUrl = createObjectURL(blob);
  const release = () => revokeObjectURL(objectUrl);
  try {
    const { width, height } = await readSize(objectUrl);
    const asset: MaterialAsset = {
      id,
      fileName,
      objectUrl,
      width,
      height,
      fileSize,
      mimeType,
    };
    assetReleaseCallbacks.set(asset, release);
    return asset;
  } catch (error) {
    release();
    throw error;
  }
}

/**
 * Idempotent release for any MaterialAsset. Safe to call after deleteAsset,
 * tool return, or React unmount even when the same asset was already released
 * — the WeakSet guarantees exactly one revoke per asset identity. Release
 * failures are swallowed so they can never mask a ready/error result.
 */
export function releaseMaterialAsset(asset: MaterialAsset): void {
  if (releasedAssets.has(asset)) return;
  releasedAssets.add(asset);
  try {
    const release = assetReleaseCallbacks.get(asset);
    assetReleaseCallbacks.delete(asset);
    if (release) release();
    else URL.revokeObjectURL(asset.objectUrl);
  } catch {}
}
