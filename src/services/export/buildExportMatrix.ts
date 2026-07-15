import { createBatchExportItems, createLanguageBatchExportItems, EXPORT_LANGUAGES, type BrandLanguage, type MaterialAsset, type MaterialSpec } from '../../core';

export function buildExportMatrix(assets: MaterialAsset[], specs: MaterialSpec[], allLanguages: boolean) {
  return allLanguages ? createLanguageBatchExportItems(assets, specs, EXPORT_LANGUAGES) : createBatchExportItems(assets, specs);
}
export function getExportLanguage(item: unknown, fallback: BrandLanguage): BrandLanguage {
  return typeof item === 'object' && item !== null && 'language' in item && typeof (item as { language?: unknown }).language === 'string'
    ? (item as { language: BrandLanguage }).language
    : fallback;
}
