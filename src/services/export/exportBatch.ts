import {
  formatMegabytes,
  getBrandLanguageLabel,
  type BoardBrandStateMap,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLanguage,
  type BrandLayerState,
  type BrandSettingsV1,
  type MaterialFormat
} from '../../core';
import { saveBlobToOutputTarget, type OutputTarget } from '../../platform/fileSystem';
import { exportBoard } from './exportBoard';
import { logDiagnostic } from '../../diagnostics';
import type { ExportJob, ResolvedExportAssets } from './exportJob';

export type BatchProgress = { current: number; total: number };
export type BatchFailure<T> = { item: T; message: string };
export type BatchItemOutcome = { result: 'success' | 'compressed'; beforeBytes?: number; outputBytes: number; actualFileName?: string };
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

export type MediaExportRequest = {
  jobs: ExportJob[];
  outputTarget: OutputTarget;
  boardBrandStates: BoardBrandStateMap;
  brandAssets: BrandAsset[];
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  format: MaterialFormat;
  quality: number;
  autoCompressJpeg: boolean;
  onProgress?: (progress: BatchProgress) => void;
};

function resolveAssetsFromJob(job: ExportJob, brandAssets: BrandAsset[]): ResolvedExportAssets {
  return {
    gameLogo: job.resolvedLogoAssetId ? brandAssets.find((asset) => asset.id === job.resolvedLogoAssetId && asset.type === 'logo') : undefined,
    companyLogo: job.resolvedCompanyLogoAssetId ? brandAssets.find((asset) => asset.id === job.resolvedCompanyLogoAssetId && asset.type === 'logo') : undefined,
    cpr: job.resolvedCprAssetId ? brandAssets.find((asset) => asset.id === job.resolvedCprAssetId && asset.type === 'cpr') : undefined,
    missingGameLogo: job.missing && !!job.missingReason?.includes('Logo'),
    missingCpr: job.missing && job.missingReason === '缺少 CPR 资源'
  };
}

function buildBrandLayerForJob(job: ExportJob, brandLayer: BrandLayerState, brandSettings: BrandSettingsV1): BrandLayerState {
  return {
    ...brandLayer,
    logoEnabled: job.brandSnapshot.logoEnabled ?? brandLayer.logoEnabled,
    logoEffect: job.brandSnapshot.logoEffect ?? brandLayer.logoEffect,
    logoGroup: job.brandSnapshot.logo,
    cprState: job.brandSnapshot.cpr,
    cprEnabled: job.brandSnapshot.cpr.enabled
  };
}

/** Executes the complete render-and-write flow outside React UI. */
export async function exportMediaBatch(request: MediaExportRequest): Promise<BatchResult<ExportJob>> {
  return exportSequentially(request.jobs, async (job) => {
    if (job.missing) {
      throw new Error(job.missingReason ?? '导出资源缺失');
    }
    const assets = resolveAssetsFromJob(job, request.brandAssets);
    const layer = buildBrandLayerForJob(job, request.brandLayer, request.brandSettings);
    const result = await exportBoard({
      asset: job.assetSnapshot,
      spec: job.specSnapshot,
      previewState: job.previewSnapshot,
      brandLayer: layer,
      logoAsset: assets.gameLogo,
      cprAsset: assets.cpr,
      companyLogoAsset: assets.companyLogo,
      gameLogoAsset: assets.gameLogo,
      format: request.format,
      quality: request.quality,
      maxBytes: job.effectiveMaxSizeKb * 1024,
      autoCompressJpeg: request.autoCompressJpeg,
      minJpegQuality: 0.4
    });
    if (!result.ok) {
      const maxLabel = `${(job.effectiveMaxSizeKb / 1024).toFixed(job.effectiveMaxSizeKb % 1024 === 0 ? 0 : 1)}MB`;
      throw new Error(result.reason === 'png-over-limit' ? `PNG 实际为 ${formatMegabytes(result.size)}，超过 ${maxLabel}；请改用 JPG 或调整尺寸` : `在保持当前尺寸时无法压缩到 ${maxLabel} 以下，请降低尺寸或调整内容`);
    }
    const actualFileName = await saveBlobToOutputTarget(request.outputTarget, job.plannedFileName, result.blob);
    if (request.outputTarget.kind === 'downloads') await new Promise((resolve) => setTimeout(resolve, 180));
    return result.compressed
      ? { result: 'compressed' as const, beforeBytes: job.estimatedBytes, outputBytes: result.blob.size, actualFileName }
      : { result: 'success' as const, outputBytes: result.blob.size, actualFileName };
  }, request.onProgress);
}
