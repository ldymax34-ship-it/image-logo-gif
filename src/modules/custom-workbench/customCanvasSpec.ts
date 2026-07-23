import type { MaterialAsset, MaterialFormat, MaterialSpec } from '../../core';

export type CustomCanvasSizeMode = 'source' | 'manual';

export type CustomCanvasSelection = {
  mode: CustomCanvasSizeMode;
  /** Present only after the user explicitly selects a manual canvas size. */
  manualSpec?: Pick<MaterialSpec, 'id' | 'name' | 'width' | 'height'>;
};

export const CUSTOM_MANUAL_CANVAS_PRESETS = [
  { id: 'custom-manual-1920x1080', name: '1920×1080', width: 1920, height: 1080 }
] as const;
export const CUSTOM_CANVAS_OPTION = 'custom';
export const MAX_CUSTOM_CANVAS_EDGE = 16384;

const SOURCE_SPEC_ID = 'custom-source-image';

function isValidSize(value: unknown): value is { width: number; height: number } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { width?: unknown; height?: unknown };
  return Number.isInteger(candidate.width) && Number.isInteger(candidate.height)
    && Number(candidate.width) >= 1 && Number(candidate.height) >= 1
    && Number(candidate.width) <= MAX_CUSTOM_CANVAS_EDGE && Number(candidate.height) <= MAX_CUSTOM_CANVAS_EDGE;
}

function toManualSpec(value: unknown): CustomCanvasSelection['manualSpec'] | undefined {
  if (!isValidSize(value)) return undefined;
  const candidate = value as { id?: unknown; name?: unknown; width: number; height: number };
  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `custom-manual-${candidate.width}x${candidate.height}`,
    name: typeof candidate.name === 'string' && candidate.name ? candidate.name : `${candidate.width}×${candidate.height}`,
    width: Math.round(candidate.width),
    height: Math.round(candidate.height)
  };
}

/**
 * No custom-workbench document is currently persisted. This resolver exists
 * for any in-memory/legacy record passed into the module: only an explicit
 * manual intent survives; missing mode (including the old implicit 1920×1080
 * default) now safely becomes source-following.
 */
export function resolveCustomCanvasSelection(value?: unknown): CustomCanvasSelection {
  if (!value || typeof value !== 'object') return { mode: 'source' };
  const candidate = value as { mode?: unknown; manualSpec?: unknown; manualSize?: unknown; hasManualSize?: unknown };
  const manualSpec = toManualSpec(candidate.manualSpec ?? candidate.manualSize);
  if (candidate.mode === 'manual' && manualSpec) return { mode: 'manual', manualSpec };
  // Some older callers may have persisted an explicit flag plus width/height.
  if (candidate.hasManualSize === true && manualSpec) return { mode: 'manual', manualSpec };
  return { mode: 'source' };
}

export function selectCustomCanvasPreset(presetId: string): CustomCanvasSelection {
  if (presetId === 'source') return { mode: 'source' };
  const preset = CUSTOM_MANUAL_CANVAS_PRESETS.find((candidate) => candidate.id === presetId);
  return preset ? { mode: 'manual', manualSpec: { ...preset } } : { mode: 'source' };
}

/** Creates an explicit arbitrary canvas size only after both integer fields are valid. */
export function createCustomCanvasSelection(width: unknown, height: unknown): CustomCanvasSelection | undefined {
  const manualSpec = toManualSpec({ width, height });
  return manualSpec ? { mode: 'manual', manualSpec } : undefined;
}

/** Maps a saved selection to the size picker without exposing manualSpec ids in UI. */
export function getCustomCanvasOptionValue(selection: CustomCanvasSelection): string {
  if (selection.mode === 'source') return 'source';
  return CUSTOM_MANUAL_CANVAS_PRESETS.some((preset) => preset.id === selection.manualSpec?.id)
    ? selection.manualSpec!.id
    : CUSTOM_CANVAS_OPTION;
}

/** The one MaterialSpec consumed by preview, Render Plan, Fabric and export. */
export function resolveCustomCanvasSpec(
  asset: Pick<MaterialAsset, 'width' | 'height'> | undefined,
  selection: CustomCanvasSelection,
  format: MaterialFormat
): MaterialSpec | undefined {
  if (selection.mode === 'manual' && selection.manualSpec) {
    return { ...selection.manualSpec, format };
  }
  if (!asset) return undefined;
  return {
    id: SOURCE_SPEC_ID,
    name: '原图尺寸',
    width: asset.width,
    height: asset.height,
    format
  };
}
