import type { MaterialAsset } from '../image/imageMeta';
import type { MaterialFormat, MaterialSpec } from '../spec/specParser';
import type { BrandLanguage } from '../brand/brandAsset';

export const EXPORT_LANGUAGES: BrandLanguage[] = ['zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'en-US'];

export type BatchExportItem = {
  id: string;
  assetId: string;
  specId: string;
};

export type LanguageBatchExportItem = BatchExportItem & { language: BrandLanguage };

export function getBatchExportItemId(assetId: string, specId: string): string {
  return `${assetId}:${specId}`;
}

export function createBatchExportItems(assets: MaterialAsset[], specs: MaterialSpec[]): BatchExportItem[] {
  return assets.flatMap((asset) =>
    specs.map((spec) => ({
      id: getBatchExportItemId(asset.id, spec.id),
      assetId: asset.id,
      specId: spec.id
    }))
  );
}

/** Expands the normal asset × board matrix with a language dimension for batch output. */
export function createLanguageBatchExportItems(assets: MaterialAsset[], specs: MaterialSpec[], languages: BrandLanguage[] = EXPORT_LANGUAGES): LanguageBatchExportItem[] {
  return createBatchExportItems(assets, specs).flatMap((item) => languages.map((language) => ({ ...item, id: `${item.id}:${language}`, language })));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function estimateExportBytes(
  asset: MaterialAsset,
  spec: MaterialSpec,
  format: MaterialFormat,
  quality = 0.9
): number {
  const sourcePixels = Math.max(1, asset.width * asset.height);
  const outputPixels = Math.max(1, spec.width * spec.height);
  const sourceDensity = asset.fileSize / sourcePixels;

  if (format === 'png') {
    const pngDensity = asset.mimeType === 'image/png'
      ? clamp(sourceDensity, 0.45, 4)
      : clamp(sourceDensity * 2.4, 0.8, 4);
    return Math.max(1024, Math.round(outputPixels * pngDensity));
  }

  const normalizedQuality = clamp(quality, 0.4, 1);
  const jpegDensity = clamp(sourceDensity * (0.35 + normalizedQuality * 0.65), 0.08, 1.5);
  return Math.max(1024, Math.round(outputPixels * jpegDensity));
}

export function formatMegabytes(bytes: number): string {
  return `${(Math.max(0, bytes) / (1024 * 1024)).toFixed(2)} MB`;
}
