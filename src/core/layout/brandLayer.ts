import { computeCprLayout, type CprLayoutResult } from './cprLayout';
import { type BrandAnchor, type BrandSizeLevel, type CanvasSize } from './layoutProfile';
import { computeLogoLayout, type LogoLayoutResult } from './logoLayout';

export type BrandAssetKind = 'logo' | 'cpr';

export type BrandSvgAsset = {
  id: string;
  kind: BrandAssetKind;
  label: string;
  language?: string;
  svgText?: string;
  viewBox?: {
    width: number;
    height: number;
  };
  aspectRatio?: number;
};

export type BrandLayerOptions = {
  canvas: CanvasSize;
  includeLogo: boolean;
  includeCpr: boolean;
  logoAsset?: BrandSvgAsset;
  cprAsset?: BrandSvgAsset;
  logoAnchor?: BrandAnchor;
  cprAnchor?: BrandAnchor;
  logoSize?: BrandSizeLevel;
  cprSize?: BrandSizeLevel;
  cprColor?: string;
};

export type BrandLayer =
  | {
      id: string;
      type: 'logo';
      asset: BrandSvgAsset;
      zIndex: 20;
      layout: LogoLayoutResult;
    }
  | {
      id: string;
      type: 'cpr';
      asset: BrandSvgAsset;
      zIndex: 30;
      layout: CprLayoutResult;
    };

export type BrandLayerRenderResult = {
  canvas: CanvasSize;
  layers: BrandLayer[];
};

export function getAssetAspectRatio(asset?: BrandSvgAsset): number | undefined {
  if (!asset) return undefined;
  if (asset.aspectRatio && asset.aspectRatio > 0) return asset.aspectRatio;
  if (asset.viewBox && asset.viewBox.width > 0 && asset.viewBox.height > 0) {
    return asset.viewBox.width / asset.viewBox.height;
  }
  return undefined;
}

export function renderBrandLayer(options: BrandLayerOptions): BrandLayerRenderResult {
  const layers: BrandLayer[] = [];
  if (options.includeLogo && options.logoAsset) {
    layers.push({
      id: `logo:${options.logoAsset.id}`,
      type: 'logo',
      asset: options.logoAsset,
      zIndex: 20,
      layout: computeLogoLayout({
        canvas: options.canvas,
        anchor: options.logoAnchor ?? 'top-right',
        sizeLevel: options.logoSize ?? 'standard',
        svgAspectRatio: getAssetAspectRatio(options.logoAsset)
      })
    });
  }
  if (options.includeCpr && options.cprAsset) {
    layers.push({
      id: `cpr:${options.cprAsset.id}`,
      type: 'cpr',
      asset: options.cprAsset,
      zIndex: 30,
      layout: computeCprLayout({
        canvas: options.canvas,
        anchor: options.cprAnchor ?? 'center',
        sizeLevel: options.cprSize ?? 'standard',
        svgAspectRatio: getAssetAspectRatio(options.cprAsset),
        color: options.cprColor
      })
    });
  }
  return { canvas: options.canvas, layers };
}
