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

export async function createMaterialAsset(file: File, id = crypto.randomUUID()): Promise<MaterialAsset> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} 不是图片文件`);
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const size = await readImageElementSize(objectUrl);
    return {
      id,
      fileName: file.name,
      objectUrl,
      width: size.width,
      height: size.height,
      fileSize: file.size,
      mimeType: file.type
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}
