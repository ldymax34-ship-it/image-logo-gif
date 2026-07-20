import {
  formatMegabytes,
  applyLanguageLogoScale,
  getBoardPreviewKey,
  getBrandLanguageLabel,
  resolveBoardBrandAssets,
  type BoardBrandStateMap,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLanguage,
  type BrandSettingsV1,
  type BrandLayerState,
  type MaterialAsset,
  type MaterialFormat,
  type MaterialSpec
} from '../../core';
import { saveBlobToOutputTarget, type OutputTarget } from '../../platform/fileSystem';
import { exportBoard } from './exportBoard';
import { logDiagnostic } from '../../diagnostics';

export type BatchProgress = { current: number; total: number };
export type BatchFailure<T> = { item: T; message: string };
export type BatchItemOutcome = { result: 'success' | 'compressed'; beforeBytes?: number; outputBytes: number };
export type BatchOutcome<T> = { item: T; outcome: BatchItemOutcome | { result: 'failed'; reason: string } };
export type BatchResult<T> = { completed: number; failures: BatchFailure<T>[]; outcomes: BatchOutcome<T>[] };

export async function exportSequentially<T>(
  items: T[],
  run: (item: T) => Promise<BatchItemOutcome>,
  onProgress?: (progress: BatchProgress) => void
): Promise<BatchResult<T>> {
  const failures: BatchFailure<T>[] = [];
  const outcomes: BatchOutcome<T>[] = [];
  let completed = 0;
  for (let index = 0; index < items.length; index += 1) {
    try {
      const outcome = await run(items[index]);
      completed += 1;
      outcomes.push({ item: items[index], outcome });
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败';
      void logDiagnostic('error', 'RENDER_FAILED', message, 'batch-export');
      failures.push({ item: items[index], message });
      outcomes.push({ item: items[index], outcome: { result: 'failed', reason: message } });
    }
    onProgress?.({ current: index + 1, total: items.length });
  }
  return { completed, failures, outcomes };
}

export type MediaExportRow = {
  item: { id: string; language?: BrandLanguage };
  asset: MaterialAsset;
  spec: MaterialSpec;
  effectiveMaxSizeKb: number;
  fileName: string;
  estimatedBytes: number;
};

export type MediaExportRequest = {
  rows: MediaExportRow[];
  outputTarget: OutputTarget;
  previewStates: Record<string, BoardPreviewState>;
  boardBrandStates: BoardBrandStateMap;
  brandAssets: BrandAsset[];
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  format: MaterialFormat;
  quality: number;
  autoCompressJpeg: boolean;
  onProgress?: (progress: BatchProgress) => void;
};

/** Executes the complete render-and-write flow outside React UI. */
export async function exportMediaBatch(request: MediaExportRequest): Promise<BatchResult<MediaExportRow>> {
  return exportSequentially(request.rows, async (row) => {
    const previewState = request.previewStates[getBoardPreviewKey(row.asset.id, row.spec.id)];
    if (!previewState) throw new Error(`${row.fileName}：缺少画板预览状态`);
    const boardBrandState = request.boardBrandStates[getBoardPreviewKey(row.asset.id, row.spec.id)];
    if (!boardBrandState) throw new Error(`${row.fileName}：缺少画板品牌状态`);
    const exportLanguage = row.item.language ?? boardBrandState.logo.gameLogoLanguage;
    const boardLayer = { ...request.brandLayer, logoEnabled: boardBrandState.logoEnabled ?? request.brandLayer.logoEnabled, logoEffect: boardBrandState.logoEffect ?? request.brandLayer.logoEffect };
    const boardAssets = resolveBoardBrandAssets({ boardBrandState, brandCatalog: request.brandAssets, brandLayer: boardLayer, languageOverride: exportLanguage });
    if (boardAssets.missingGameLogo) throw new Error(`缺少 ${getBrandLanguageLabel(exportLanguage)} Logo 资源`);
    if (boardAssets.missingCpr) throw new Error('缺少 CPR 资源');
    const languageGroup = { ...applyLanguageLogoScale(boardBrandState.logo, exportLanguage, request.brandSettings), gameLogoId: boardAssets.gameLogo?.id };
    const result = await exportBoard({
      asset: row.asset,
      spec: row.spec,
      previewState,
      brandLayer: { ...boardLayer, logoLanguage: exportLanguage, logoGroup: languageGroup, cprState: boardBrandState.cpr, cprEnabled: boardBrandState.cpr.enabled },
      logoAsset: boardAssets.gameLogo,
      cprAsset: boardAssets.cpr,
      companyLogoAsset: boardAssets.companyLogo,
      gameLogoAsset: boardAssets.gameLogo,
      format: request.format,
      quality: request.quality,
      maxBytes: row.effectiveMaxSizeKb * 1024,
      autoCompressJpeg: request.autoCompressJpeg,
      minJpegQuality: 0.4
    });
    if (!result.ok) {
      const maxLabel = `${(row.effectiveMaxSizeKb / 1024).toFixed(row.effectiveMaxSizeKb % 1024 === 0 ? 0 : 1)}MB`;
      throw new Error(result.reason === 'png-over-limit' ? `PNG 实际为 ${formatMegabytes(result.size)}，超过 ${maxLabel}；请改用 JPG 或调整尺寸` : `在保持当前尺寸时无法压缩到 ${maxLabel} 以下，请降低尺寸或调整内容`);
    }
    await saveBlobToOutputTarget(request.outputTarget, row.fileName, result.blob);
    if (request.outputTarget.kind === 'downloads') await new Promise((resolve) => setTimeout(resolve, 180));
    return result.compressed
      ? { result: 'compressed' as const, beforeBytes: row.estimatedBytes, outputBytes: result.blob.size }
      : { result: 'success' as const, outputBytes: result.blob.size };
  }, request.onProgress);
}
