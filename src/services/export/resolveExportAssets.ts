import { EXPORT_LANGUAGES, type BrandAsset, type BrandLanguage } from '../../core';
import type { ExportLanguageResolution } from './exportTypes';

export function resolveLanguageLogo(assets: BrandAsset[], language: BrandLanguage): BrandAsset | undefined {
  return assets.find((asset) => asset.type === 'logo' && asset.language === language);
}

export function resolveExportLanguages(assets: BrandAsset[]): ExportLanguageResolution[] {
  return EXPORT_LANGUAGES.map((language) => ({ language, gameLogo: resolveLanguageLogo(assets, language), missing: !resolveLanguageLogo(assets, language) }));
}
