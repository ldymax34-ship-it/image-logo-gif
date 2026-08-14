import { DEFAULT_BRAND_LAYER, createInitialCropState, type BoardPreviewState, type MaterialAsset, type MaterialSpec } from '../core';
import type { WatermarkConfig } from '../core/image/watermarkRenderPlan';
import { getBoardPreviewKey } from '../core';
import { createWorkbenchWatermarkConfig, type WatermarkBusinessConfig, type WatermarkOverride } from './WatermarkWorkbench';

export type WatermarkExportItem = {
  asset: MaterialAsset;
  spec: MaterialSpec;
  fileName: string;
};

export type WatermarkRenderInput = {
  asset: MaterialAsset;
  spec: MaterialSpec;
  previewState: BoardPreviewState;
  brandLayer: typeof DEFAULT_BRAND_LAYER;
  watermarkConfig: WatermarkConfig | undefined;
};

/**
 * Builds the single normalized render input used by both preview and export.
 * Both paths call this so the exact same WatermarkConfig (and thus the same
 * expanded render layers) drives the visible preview and the exported pixels.
 */
export function buildWatermarkRenderInput(
  item: Pick<WatermarkExportItem, 'asset' | 'spec'>,
  config: WatermarkBusinessConfig,
  override: WatermarkOverride | undefined,
  logoAsset: MaterialAsset | undefined,
  previewStates: Record<string, BoardPreviewState>,
): WatermarkRenderInput {
  const key = getBoardPreviewKey(item.asset.id, item.spec.id);
  const previewState = previewStates[key] ?? {
    assetId: item.asset.id,
    specId: item.spec.id,
    fitMode: 'contain' as const,
    crop: createInitialCropState(item.asset, item.spec, 'contain'),
  };
  return {
    asset: item.asset,
    spec: item.spec,
    previewState,
    brandLayer: { ...DEFAULT_BRAND_LAYER, logoEnabled: false, cprEnabled: false },
    watermarkConfig: createWorkbenchWatermarkConfig(item.spec, config, override, logoAsset),
  };
}
