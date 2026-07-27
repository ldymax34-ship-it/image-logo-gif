import { exportJpegWithinLimit, type JpegLimitResult } from '../export/sizeLimit';
import { buildBrandRenderPlan, createBrandGrid, deriveBrandColorMode, getBrandAssetUrl, getGridSafeArea, resolveColorEffect, resolveCprState, toBrandSvgAsset, type BrandAsset, type BrandEffectState, type BrandLayerState } from '../brand';
import { renderBrandLayer, type LayoutRect } from '../layout';
import { computeCropTransform, type BoardPreviewState } from './crop';
import type { MaterialAsset } from './imageMeta';
import { buildWatermarkRenderLayers, type WatermarkConfig, type WatermarkLayerInstance } from './watermarkRenderPlan';
import type { MaterialFormat, MaterialSpec } from '../spec/specParser';

export type BoardRenderLayer = {
  id: string;
  type: 'logo' | 'cpr';
  asset: BrandAsset;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zIndex: number;
  effect: BrandEffectState;
};

type BoardRenderLayerCandidate = BoardRenderLayer | undefined;

export type BoardRenderPlan = {
  canvas: {
    width: number;
    height: number;
  };
  image: {
    src: string;
    alt: string;
    rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  layers: BoardRenderLayer[];
  safeArea: LayoutRect;
  watermarkLayers: WatermarkLayerInstance[];
};

export type BoardRenderInput = {
  asset: MaterialAsset;
  spec: MaterialSpec;
  previewState: BoardPreviewState;
  brandLayer: BrandLayerState;
  logoAsset?: BrandAsset;
  cprAsset?: BrandAsset;
  companyLogoAsset?: BrandAsset;
  gameLogoAsset?: BrandAsset;
  watermarkConfig?: WatermarkConfig;
};

export type ExportBoardImageOptions = BoardRenderInput & {
  format?: MaterialFormat;
  quality?: number;
};

export type SizeLimitedExportSuccess = {
  ok: true;
  blob: Blob;
  quality?: number;
  compressed: boolean;
};

export type SizeLimitedExportFailure = {
  ok: false;
  reason: 'png-over-limit' | 'jpeg-over-limit';
  size: number;
  minQuality?: number;
};

export type SizeLimitedExportResult = SizeLimitedExportSuccess | SizeLimitedExportFailure;

export function buildBoardRenderPlan(input: BoardRenderInput): BoardRenderPlan {
  const transform = computeCropTransform(input.asset, input.spec, input.previewState.crop);
  const brandGroup = input.brandLayer.logoGroup;
  if (brandGroup) {
    const grouped = buildBrandRenderPlan(
      { width: input.spec.width, height: input.spec.height },
      brandGroup,
      {
        companyLogo: input.companyLogoAsset,
        gameLogo: input.gameLogoAsset ?? input.logoAsset,
        cpr: {
          ...resolveCprState(input.brandLayer),
          enabled: input.brandLayer.cprEnabled && Boolean(input.cprAsset)
        },
        effect: input.brandLayer.logoEffect
      }
    );
    const assetsByLayerId = new Map<string, BrandAsset>();
    if (input.companyLogoAsset) assetsByLayerId.set(`logo:${input.companyLogoAsset.id}`, input.companyLogoAsset);
    if (input.gameLogoAsset ?? input.logoAsset) {
      const gameAsset = input.gameLogoAsset ?? input.logoAsset;
      if (gameAsset) assetsByLayerId.set(`logo:${gameAsset.id}`, gameAsset);
    }
    if (input.cprAsset) assetsByLayerId.set('cpr:fixed', input.cprAsset);
    const layers: BoardRenderLayer[] = [
      ...(!input.brandLayer.logoEnabled ? [] : grouped.logoItems).map((item, index) => {
        const asset = assetsByLayerId.get(item.id);
        return asset ? { id: item.id, type: 'logo' as const, asset, rect: item.rect, zIndex: 20 + index, effect: item.effect } : undefined;
      }),
      grouped.cpr && input.cprAsset
        ? {
            id: grouped.cpr.id,
            type: 'cpr' as const,
            asset: input.cprAsset,
            rect: grouped.cpr.rect,
            zIndex: 30,
            effect: grouped.cpr.effect
          }
        : undefined
    ].filter((layer): layer is BoardRenderLayer => Boolean(layer));

    return {
      canvas: { width: input.spec.width, height: input.spec.height },
      image: {
        src: input.asset.objectUrl,
        alt: input.asset.fileName,
        rect: { x: transform.offsetX, y: transform.offsetY, width: transform.width, height: transform.height }
      },
      layers,
      safeArea: grouped.safeArea,
      watermarkLayers: input.watermarkConfig
        ? buildWatermarkRenderLayers({ width: input.spec.width, height: input.spec.height }, input.watermarkConfig)
        : []
    };
  }
  const brandPreview = renderBrandLayer({
    canvas: { width: input.spec.width, height: input.spec.height },
    includeLogo: input.brandLayer.logoEnabled && Boolean(input.logoAsset),
    includeCpr: input.brandLayer.cprEnabled && Boolean(input.cprAsset),
    logoAsset: input.logoAsset ? toBrandSvgAsset(input.logoAsset) : undefined,
    cprAsset: input.cprAsset ? toBrandSvgAsset(input.cprAsset) : undefined,
    logoAnchor: input.brandLayer.logoAnchor,
    cprAnchor: input.brandLayer.cprAnchor,
    logoSize: input.brandLayer.logoSize,
    cprColor: input.brandLayer.cprEffect.color
  });

  return {
    canvas: {
      width: input.spec.width,
      height: input.spec.height
    },
    image: {
      src: input.asset.objectUrl,
      alt: input.asset.fileName,
      rect: {
        x: transform.offsetX,
        y: transform.offsetY,
        width: transform.width,
        height: transform.height
      }
    },
    layers: brandPreview.layers
      .map((layer): BoardRenderLayerCandidate => {
        const asset = layer.type === 'logo' ? input.logoAsset : input.cprAsset;
        if (!asset) return undefined;
        return {
          id: layer.id,
          type: layer.type,
          asset,
          rect: layer.layout.rect,
          zIndex: layer.zIndex,
          effect: resolveColorEffect(
            deriveBrandColorMode(layer.type === 'logo' ? input.brandLayer.logoEffect : input.brandLayer.cprEffect),
            layer.type === 'logo' ? input.brandLayer.logoEffect : input.brandLayer.cprEffect
          )
        } satisfies BoardRenderLayer;
      })
     .filter((layer): layer is BoardRenderLayer => Boolean(layer)),
    safeArea: getGridSafeArea(createBrandGrid({ width: input.spec.width, height: input.spec.height })),
    watermarkLayers: input.watermarkConfig
      ? buildWatermarkRenderLayers({ width: input.spec.width, height: input.spec.height }, input.watermarkConfig)
      : []
  };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`图片加载失败: ${src}`));
  });
  image.src = src;
  if ('decode' in image) {
    try {
      await image.decode();
      return image;
    } catch {
      return loaded;
    }
  }
  return loaded;
}

function tintImage(source: CanvasImageSource, width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建离屏画布');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, width, height);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-over';
  return canvas;
}

function drawEffectImage(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  rect: { x: number; y: number; width: number; height: number },
  effect: BrandEffectState
) {
  if (effect.strokeEnabled && effect.strokeWidth > 0) {
    const strokeSource = tintImage(source, Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), effect.strokeColor);
    const width = effect.strokeWidth;
    const directions = [
      [width, 0],
      [-width, 0],
      [0, width],
      [0, -width],
      [width, width],
      [-width, width],
      [width, -width],
      [-width, -width]
    ];
    for (const [offsetX, offsetY] of directions) {
      context.drawImage(strokeSource, rect.x + offsetX, rect.y + offsetY, rect.width, rect.height);
    }
  }

  if (effect.glowEnabled && effect.glowBlur > 0) {
    context.save();
    context.shadowColor = effect.glowColor;
    context.shadowBlur = effect.glowBlur;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    context.restore();
  }

  if (effect.shadowEnabled && effect.shadowBlur > 0) {
    context.save();
    context.shadowColor = effect.shadowColor;
    context.shadowBlur = effect.shadowBlur;
    context.shadowOffsetX = effect.shadowOffsetX;
    context.shadowOffsetY = effect.shadowOffsetY;
    context.globalAlpha = effect.shadowOpacity;
    context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    context.restore();
  }

  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
}

async function drawBrandLayer(context: CanvasRenderingContext2D, layer: BoardRenderLayer): Promise<void> {
  const assetSource = getBrandAssetUrl(layer.asset);
  try {
    const image = await loadImageElement(assetSource.url);
    const width = Math.max(1, Math.round(layer.rect.width));
    const height = Math.max(1, Math.round(layer.rect.height));
    const source = layer.effect.colorEnabled ? tintImage(image, width, height, layer.effect.color) : image;
    drawEffectImage(context, source, layer.rect, layer.effect);
  } finally {
    if (assetSource.revoke) {
      URL.revokeObjectURL(assetSource.url);
    }
  }
}

export async function drawWatermarkLayers(context: CanvasRenderingContext2D, layers: WatermarkLayerInstance[]): Promise<void> {
  const images = new Map<string, Promise<HTMLImageElement>>();
  for (const layer of layers) {
    context.save();
    try {
      context.translate(layer.cx, layer.cy);
      context.rotate((layer.rotation * Math.PI) / 180);
      context.globalAlpha = layer.opacity;
      if (layer.kind === 'text') {
        context.fillStyle = layer.color;
        context.font = `${layer.fontSize}px ${layer.fontFamily}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(layer.text, 0, 0);
      } else {
        let image = images.get(layer.src);
        if (!image) {
          image = loadImageElement(layer.src);
          images.set(layer.src, image);
        }
        const source = await image;
        context.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
      }
    } finally {
      context.restore();
    }
  }
}

export async function renderBoardToCanvas(input: BoardRenderInput & { format?: MaterialFormat }): Promise<HTMLCanvasElement> {
  const plan = buildBoardRenderPlan(input);
  const canvas = createCanvas(plan.canvas.width, plan.canvas.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建导出画布');

  const outputFormat = input.format ?? input.spec.format;
  if (outputFormat === 'jpg') {
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  const sourceImage = await loadImageElement(plan.image.src);
  context.drawImage(
    sourceImage,
    plan.image.rect.x,
    plan.image.rect.y,
    plan.image.rect.width,
    plan.image.rect.height
  );

  const sortedLayers = [...plan.layers].sort((left, right) => left.zIndex - right.zIndex);
  for (const layer of sortedLayers) {
    await drawBrandLayer(context, layer);
  }
  await drawWatermarkLayers(context, plan.watermarkLayers);

  return canvas;
}

export async function drawBrandLayersToCanvas(canvas: HTMLCanvasElement, layers: BoardRenderLayer[]): Promise<void> {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建导出画布');
  for (const layer of [...layers].sort((left, right) => left.zIndex - right.zIndex)) {
    await drawBrandLayer(context, layer);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: MaterialFormat, quality = 0.92): Promise<Blob> {
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('导出失败，未生成文件'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      format === 'png' ? undefined : quality
    );
  });
}

export async function exportBoardImage(options: ExportBoardImageOptions): Promise<Blob> {
  const canvas = await renderBoardToCanvas(options);
  return canvasToBlob(canvas, options.format ?? options.spec.format, options.quality ?? 0.92);
}

export async function exportBoardImageWithinLimit(options: ExportBoardImageOptions & {
  maxBytes: number;
  autoCompressJpeg?: boolean;
  minJpegQuality?: number;
}): Promise<SizeLimitedExportResult> {
  const canvas = await renderBoardToCanvas(options);
  const format = options.format ?? options.spec.format;
  const quality = options.quality ?? 0.92;

  if (format === 'png') {
    const blob = await canvasToBlob(canvas, 'png');
    return blob.size <= options.maxBytes
      ? { ok: true, blob, compressed: false }
      : { ok: false, reason: 'png-over-limit', size: blob.size };
  }

  const initialBlob = await canvasToBlob(canvas, 'jpg', quality);
  if (!options.autoCompressJpeg || initialBlob.size <= options.maxBytes) {
    return initialBlob.size <= options.maxBytes
      ? { ok: true, blob: initialBlob, quality, compressed: false }
      : { ok: false, reason: 'jpeg-over-limit', size: initialBlob.size, minQuality: options.minJpegQuality ?? 0.4 };
  }

  const result: JpegLimitResult = await exportJpegWithinLimit({
    encode: (nextQuality) => canvasToBlob(canvas, 'jpg', nextQuality),
    initialQuality: quality,
    maxBytes: options.maxBytes,
    minQuality: options.minJpegQuality
  });
  return result.ok
    ? { ok: true, blob: result.blob, quality: result.quality, compressed: result.compressed }
    : { ok: false, reason: 'jpeg-over-limit', size: result.size, minQuality: result.minQuality };
}
