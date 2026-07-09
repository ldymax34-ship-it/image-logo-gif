import { createBrandAsset, type BrandAsset, type BrandAssetType, type BrandLanguage } from './brandAsset';

export async function createBrandAssetFromFile(
  file: File,
  type: BrandAssetType,
  language: BrandLanguage,
  id = crypto.randomUUID()
): Promise<BrandAsset> {
  if (file.type && file.type !== 'image/svg+xml' && !file.name.toLowerCase().endsWith('.svg')) {
    throw new Error(`${file.name} 不是 SVG 文件`);
  }
  const svgText = await file.text();
  return createBrandAsset({
    id,
    type,
    name: file.name,
    language,
    svgText
  });
}

export function createSvgObjectUrl(svgText: string): string {
  return URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
}
