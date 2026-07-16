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

export type ExportLanguageSelection = {
  baseLanguage: BrandLanguage;
  additionalLanguages: BrandLanguage[];
};

export type ExportSizePolicy =
  | { mode: 'default-limit'; maxSizeKb: number }
  | { mode: 'unlimited' }
  | { mode: 'custom'; maxSizeKb: number };

export type ExportItemResult =
  | { status: 'success'; outputBytes: number }
  | { status: 'compressed'; beforeBytes: number; outputBytes: number }
  | { status: 'failed'; reason: string };
