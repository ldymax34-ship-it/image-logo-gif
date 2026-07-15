import type { BrandAsset, BrandLanguage, BrandLayerState, BoardPreviewState, MaterialAsset, MaterialFormat, MaterialSpec } from '../../core';

export type ExportBoardRequest = {
  asset: MaterialAsset;
  spec: MaterialSpec;
  previewState: BoardPreviewState;
  brandLayer: BrandLayerState;
  logoAsset?: BrandAsset;
  cprAsset?: BrandAsset;
  companyLogoAsset?: BrandAsset;
  gameLogoAsset?: BrandAsset;
  format: MaterialFormat;
  quality: number;
  maxBytes: number;
  autoCompressJpeg: boolean;
  minJpegQuality?: number;
};

export type ExportLanguageResolution = { language: BrandLanguage; gameLogo?: BrandAsset; missing: boolean };
