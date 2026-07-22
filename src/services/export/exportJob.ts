import {
  applyLanguageLogoScale,
  buildOutputFileName,
  estimateExportBytes,
  getBoardPreviewKey,
  getEffectiveMaxSizeKb,
  resolveBoardBrandAssets,
  type BoardBrandState,
  type BoardBrandStateMap,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLanguage,
  type BrandLayerState,
  type BrandSettingsV1,
  type MaterialAsset,
  type MaterialSpec
} from '../../core';
import type { ExportSizePolicy } from './exportTypes';

export type ResolvedExportAssets = {
  gameLogo?: BrandAsset;
  companyLogo?: BrandAsset;
  cpr?: BrandAsset;
  missingGameLogo: boolean;
  missingCpr: boolean;
};

/**
 * Immutable export job. All writable board state is snapshotted at job creation
 * so preview and final export consume exactly the same resolution result.
 */
export type ExportJob = {
  id: string;
  boardKey: string;
  assetId: string;
  specId: string;
  assetSnapshot: MaterialAsset;
  specSnapshot: MaterialSpec;
  previewSnapshot: BoardPreviewState;
  brandSnapshot: BoardBrandState;
  requestedLanguage: BrandLanguage;
  /** Actual language of the resolved game logo; undefined when no game logo is required. */
  resolvedLogoLanguage?: BrandLanguage;
  resolvedLogoAssetId?: string;
  resolvedCompanyLogoAssetId?: string;
  resolvedCprAssetId?: string;
  plannedFileName: string;
  missing: boolean;
  missingReason?: string;
  estimatedBytes: number;
  effectiveMaxSizeKb: number;
};

export type ExportLanguageMode = 'default' | 'append' | 'all';

export type ExportNamingMode = 'source-name' | 'custom-name';

export type BuildExportJobsOptions = {
  assets: MaterialAsset[];
  specs: MaterialSpec[];
  previewStates: Record<string, BoardPreviewState>;
  boardBrandStates: BoardBrandStateMap;
  brandAssets: BrandAsset[];
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  format: MaterialSpec['format'];
  quality: number;
  sizePolicy: ExportSizePolicy;
  languageMode: ExportLanguageMode;
  additionalLanguages?: BrandLanguage[];
  namingMode: ExportNamingMode;
  customNameByAsset?: Record<string, string>;
  batchName?: string;
};

export const EXPORT_LANGUAGES: BrandLanguage[] = ['zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'en-US'];

function resolveLanguagesForBoard(boardLanguage: BrandLanguage, mode: ExportLanguageMode, additional: BrandLanguage[], logoLanguageMeaningful: boolean): BrandLanguage[] {
  if (!logoLanguageMeaningful) return [boardLanguage];
  if (mode === 'all') return [...EXPORT_LANGUAGES];
  if (mode === 'append') {
    return [...new Set([boardLanguage, ...additional.filter((language) => language !== boardLanguage)])];
  }
  return [boardLanguage];
}

function isLogoLanguageMeaningful(brandSnapshot: BoardBrandState): boolean {
  return brandSnapshot.logoEnabled !== false && brandSnapshot.logo.mode !== 'company-only';
}

function buildPlannedFileName(
  spec: MaterialSpec,
  options: {
    namingMode: ExportNamingMode;
    customName?: string;
    sourceName: string;
    batchName?: string;
    language?: BrandLanguage;
    logoLanguageMeaningful: boolean;
    disambiguation?: string;
  }
): string {
  const baseName = options.namingMode === 'custom-name' && options.customName
    ? options.customName
    : options.sourceName;
  return buildOutputFileName(
    { ...spec, format: spec.format },
    {
      sourceName: baseName,
      batchName: options.batchName,
      language: options.logoLanguageMeaningful ? options.language : undefined,
      includeSpecName: false,
      includeIndex: false,
      disambiguation: options.disambiguation
    }
  );
}

export function buildExportJobs(options: BuildExportJobsOptions): ExportJob[] {
  const { assets, specs, previewStates, boardBrandStates, brandAssets, brandLayer, brandSettings, format, quality, sizePolicy, languageMode, additionalLanguages = [], namingMode, customNameByAsset = {}, batchName } = options;
  type JobEntry = { job: Omit<ExportJob, 'plannedFileName'>; baseName: string; namingCtx: Parameters<typeof buildPlannedFileName>[1] };
  const entries: JobEntry[] = [];

  for (const asset of assets) {
    const sourceName = asset.fileName.replace(/\.[^.]+$/g, '');
    const customName = customNameByAsset[asset.id];

    for (const spec of specs) {
      const boardKey = getBoardPreviewKey(asset.id, spec.id);
      const previewSnapshot = previewStates[boardKey];
      const brandSnapshot = boardBrandStates[boardKey];
      if (!previewSnapshot || !brandSnapshot) continue;

      const specSnapshot = { ...spec, format };
      const boardLanguage = brandSnapshot.logo.gameLogoLanguage;
      const logoLanguageMeaningful = isLogoLanguageMeaningful(brandSnapshot);
      const languages = resolveLanguagesForBoard(boardLanguage, languageMode, additionalLanguages, logoLanguageMeaningful);

      for (const language of languages) {
        const scaledLogo = applyLanguageLogoScale(brandSnapshot.logo, language, brandSettings);
        const boardLayer: BrandLayerState = {
          ...brandLayer,
          logoEnabled: brandSnapshot.logoEnabled ?? brandLayer.logoEnabled,
          logoEffect: brandSnapshot.logoEffect ?? brandLayer.logoEffect,
          logoGroup: scaledLogo
        };

        const resolved = resolveBoardBrandAssets({
          boardBrandState: brandSnapshot,
          brandCatalog: brandAssets,
          brandLayer: boardLayer,
          languageOverride: language
        });

        const resolvedLogoLanguage = resolved.gameLogo?.language;
        const missingGameLogo = logoLanguageMeaningful && !resolved.gameLogo;
        const missingCpr = brandLayer.cprEnabled && brandSnapshot.cpr.enabled && !resolved.cpr;
        const languageMismatch = logoLanguageMeaningful && resolvedLogoLanguage !== language;
        const missing = missingGameLogo || missingCpr || languageMismatch;

        let missingReason: string | undefined;
        if (missingGameLogo) missingReason = `缺少 ${language} Logo 资源`;
        else if (languageMismatch) missingReason = `Logo 资源语言不匹配：请求 ${language}，解析到 ${resolvedLogoLanguage ?? '无'}`;
        else if (missingCpr) missingReason = '缺少 CPR 资源';

        const effectiveMaxSizeKb = sizePolicy.mode === 'unlimited'
          ? Number.MAX_SAFE_INTEGER
          : getEffectiveMaxSizeKb(specSnapshot, sizePolicy.mode === 'custom' ? sizePolicy.maxSizeKb : sizePolicy.maxSizeKb || 8192);

        const namingCtx = { namingMode, customName, sourceName, batchName, language, logoLanguageMeaningful };
        const baseName = buildPlannedFileName(specSnapshot, namingCtx);

        entries.push({
          job: {
          id: `${boardKey}:${language}`,
          boardKey,
          assetId: asset.id,
          specId: spec.id,
          assetSnapshot: asset,
          specSnapshot,
          previewSnapshot: { ...previewSnapshot, crop: { ...previewSnapshot.crop } },
          brandSnapshot: {
            logo: { ...scaledLogo, manualOffset: scaledLogo.manualOffset ? { ...scaledLogo.manualOffset } : undefined },
            cpr: { ...brandSnapshot.cpr, transform: { ...brandSnapshot.cpr.transform }, effect: { ...brandSnapshot.cpr.effect } },
            logoEnabled: brandSnapshot.logoEnabled,
            logoEffect: brandSnapshot.logoEffect ? { ...brandSnapshot.logoEffect } : undefined
          },
          requestedLanguage: language,
          resolvedLogoLanguage,
          resolvedLogoAssetId: resolved.gameLogo?.id,
          resolvedCompanyLogoAssetId: resolved.companyLogo?.id,
          resolvedCprAssetId: resolved.cpr?.id,
          missing,
          missingReason,
          estimatedBytes: estimateExportBytes(asset, specSnapshot, format, quality),
          effectiveMaxSizeKb
          },
          baseName,
          namingCtx
        });
      }
    }
  }

  // Detect name collisions and add deterministic disambiguation (_2, _3, ...)
  const nameCount = new Map<string, number>();
  for (const entry of entries) {
    nameCount.set(entry.baseName, (nameCount.get(entry.baseName) ?? 0) + 1);
  }
  const nameIndex = new Map<string, number>();

  return entries.map(({ job, baseName, namingCtx }) => {
    const count = nameCount.get(baseName) ?? 1;
    if (count <= 1) return { ...job, plannedFileName: baseName };
    const index = (nameIndex.get(baseName) ?? 0) + 1;
    nameIndex.set(baseName, index);
    if (index === 1) return { ...job, plannedFileName: baseName };
    return { ...job, plannedFileName: buildPlannedFileName(job.specSnapshot, { ...namingCtx, disambiguation: String(index) }) };
  });
}
