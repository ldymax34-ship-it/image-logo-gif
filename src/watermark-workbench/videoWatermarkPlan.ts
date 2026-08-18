import { buildWatermarkCenters, buildWatermarkRenderLayers, type WatermarkConfig, type WatermarkLayerInstance } from '../core/image/watermarkRenderPlan';
import type { WatermarkAnchor, WatermarkBusinessConfig } from './WatermarkWorkbench';
import type { VideoWatermarkAsset } from './videoWatermarkAdapter';

export const VIDEO_PREVIEW_WIDTH = 960;

const ANCHOR_OFFSETS: Record<WatermarkAnchor, { x: number; y: number }> = {
  'top-left': { x: -0.5, y: -0.5 },
  'top-center': { x: 0, y: -0.5 },
  'top-right': { x: 0.5, y: -0.5 },
  'middle-left': { x: -0.5, y: 0 },
  center: { x: 0, y: 0 },
  'middle-right': { x: 0.5, y: 0 },
  'bottom-left': { x: -0.5, y: 0.5 },
  'bottom-center': { x: 0, y: 0.5 },
  'bottom-right': { x: 0.5, y: 0.5 },
};

export function videoCanvasSize(asset: Pick<VideoWatermarkAsset, 'metadata'>): { width: number; height: number } {
  const sourceWidth = asset.metadata?.width ?? VIDEO_PREVIEW_WIDTH;
  const sourceHeight = asset.metadata?.height ?? Math.round(sourceWidth * 9 / 16);
  const height = Math.max(2, Math.round(VIDEO_PREVIEW_WIDTH * sourceHeight / sourceWidth));
  return { width: VIDEO_PREVIEW_WIDTH, height: height - height % 2 };
}

/**
 * Builds the shared `WatermarkConfig` for a given canvas. Both the preview
 * canvas and the FFmpeg placements path call this with their own resolution,
 * so they consume the exact same pure geometry and density semantics.
 */
export function videoWatermarkConfigForCanvas(
  canvas: { width: number; height: number },
  config: WatermarkBusinessConfig,
): WatermarkConfig {
  const short = Math.min(canvas.width, canvas.height);
  const anchor = ANCHOR_OFFSETS[config.anchor] ?? ANCHOR_OFFSETS.center;
  const anchorApplies = config.pattern === 'single';
  const offsetX = (anchorApplies ? anchor.x * canvas.width : 0) + config.offsetX;
  const offsetY = (anchorApplies ? anchor.y * canvas.height : 0) + config.offsetY;
  return {
    kind: 'text',
    text: config.text,
    fontFamily: 'Source Han Sans SC',
    color: '#ffffff',
    fontSize: Math.max(1, short * config.fontSize / 100),
    pattern: config.pattern === 'single' ? 'single' : 'brick',
    rotation: config.rotation,
    opacity: config.opacity,
    offsetX,
    offsetY,
    phaseOffset: config.phaseOffset,
    density: config.density,
  };
}

/** Watermark layers in preview-canvas space (960 wide), drawn 1:1 by the canvas. */
export function videoWatermarkLayers(
  asset: VideoWatermarkAsset,
  config: WatermarkBusinessConfig,
): WatermarkLayerInstance[] {
  const canvas = videoCanvasSize(asset);
  return buildWatermarkRenderLayers(canvas, videoWatermarkConfigForCanvas(canvas, config));
}

/** Watermark centers as percentages of the source frame, for FFmpeg output. */
export function videoWatermarkPlacements(
  asset: VideoWatermarkAsset,
  config: WatermarkBusinessConfig,
): Array<{ xPercent: number; yPercent: number }> {
  const source = { width: asset.metadata?.width ?? 1920, height: asset.metadata?.height ?? 1080 };
  return buildWatermarkCenters(source, videoWatermarkConfigForCanvas(source, config)).map((center) => ({
    xPercent: center.cx / source.width * 100,
    yPercent: center.cy / source.height * 100,
  }));
}
