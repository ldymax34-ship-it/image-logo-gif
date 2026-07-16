import { createBatchExportItems, createLanguageBatchExportItems, EXPORT_LANGUAGES, type BrandLanguage, type MaterialAsset, type MaterialSpec } from '../../core';
import type { ExportLanguageSelection } from './exportTypes';

export function buildExportMatrix(assets: MaterialAsset[], specs: MaterialSpec[], allLanguages: boolean) {
  return allLanguages ? createLanguageBatchExportItems(assets, specs, EXPORT_LANGUAGES) : createBatchExportItems(assets, specs);
}
export function getExportLanguage(item: unknown, fallback: BrandLanguage): BrandLanguage {
  return typeof item === 'object' && item !== null && 'language' in item && typeof (item as { language?: unknown }).language === 'string'
    ? (item as { language: BrandLanguage }).language
    : fallback;
}

export function getSelectedExportLanguages(selection: ExportLanguageSelection): BrandLanguage[] {
  return [...new Set([selection.baseLanguage, ...selection.additionalLanguages.filter((language) => language !== selection.baseLanguage && language !== 'custom')])];
}

export function buildExportMatrixForLanguages(assets: MaterialAsset[], specs: MaterialSpec[], selection: ExportLanguageSelection) {
  const languages = getSelectedExportLanguages(selection);
  return languages.length === 1 && languages[0] === selection.baseLanguage
    ? createLanguageBatchExportItems(assets, specs, languages)
    : createLanguageBatchExportItems(assets, specs, languages);
}
