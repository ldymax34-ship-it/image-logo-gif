import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildWatermarkRenderLayers, measureWatermarkTextContent } from '../src/core/image/watermarkRenderPlan';
import { DEFAULT_CONFIG, type WatermarkBusinessConfig } from '../src/watermark-workbench/WatermarkWorkbench';
import { videoCanvasSize, videoWatermarkLayers, videoWatermarkPlacements } from '../src/watermark-workbench/videoWatermarkPlan';
import type { VideoWatermarkAsset } from '../src/watermark-workbench/videoWatermarkAdapter';

const outputDir = process.argv[2] ?? '/tmp/watermark-brick-evidence';
const TEXT = '\u00a9KURO GAMES ALL RIGHTS RESERVED';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type Layer = { cx: number; cy: number; rotation: number; opacity: number; fontSize: number; text: string };

function svg(width: number, height: number, layers: Layer[], label: string): string {
  const nodes = layers.map((layer, index) => `<g transform="translate(${layer.cx} ${layer.cy}) rotate(${layer.rotation})" opacity="${layer.opacity}"><text x="0" y="0" fill="#ffffff" font-family="'Source Han Sans SC', sans-serif" font-size="${layer.fontSize}" text-anchor="middle" dominant-baseline="middle">${escapeXml(layer.text)}</text><path d="M 0 -${layer.fontSize / 2} L 0 ${layer.fontSize / 2} M -${layer.fontSize} 0 L ${layer.fontSize} 0" stroke="#ff0099" stroke-width="1.5" fill="none"/><text x="0" y="-${layer.fontSize / 2 - 4}" fill="#00ffcc" font-size="10" text-anchor="middle">${index + 1}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#111418"/>
${nodes}
<text x="8" y="20" fill="#888" font-size="14">${escapeXml(label)} · ${layers.length} instances</text>
</svg>`;
}

function minDistance(layers: Layer[]): number {
  let min = Infinity;
  for (let i = 0; i < layers.length; i += 1) {
    for (let j = i + 1; j < layers.length; j += 1) {
      const d = Math.hypot(layers[i].cx - layers[j].cx, layers[i].cy - layers[j].cy);
      if (d < min) min = d;
    }
  }
  return min;
}

function toLayers(layers: ReturnType<typeof buildWatermarkRenderLayers>): Layer[] {
  return layers.filter((l) => l.kind === 'text').map((l) => (l.kind === 'text' ? {
    cx: l.cx, cy: l.cy, rotation: l.rotation, opacity: l.opacity, fontSize: l.fontSize, text: l.text,
  } : { cx: 0, cy: 0, rotation: 0, opacity: 0, fontSize: 0, text: '' })).filter((l) => l.fontSize > 0);
}

// 1. Image watermark at 1920×1080, 5% = 54px.
const imageConfig = {
  kind: 'text' as const,
  text: TEXT,
  fontFamily: 'Source Han Sans SC',
  color: '#ffffff',
  fontSize: 54,
  pattern: 'brick' as const,
  rotation: 45,
  opacity: DEFAULT_CONFIG.opacity,
  offsetX: DEFAULT_CONFIG.offsetX,
  offsetY: DEFAULT_CONFIG.offsetY,
  density: 'dense' as const,
  phaseOffset: 0.5,
};
const imageLayers = toLayers(buildWatermarkRenderLayers({ width: 1920, height: 1080 }, imageConfig));

// 2. Video preview canvas at 960×540 (the canvas-space plan).
const asset: VideoWatermarkAsset = {
  id: 'evidence',
  inputPath: '/tmp/P6-GIF1.mp4',
  fileName: 'P6-GIF1.mp4',
  metadata: { duration: 8.02, width: 3840, height: 2160, fps: 60, codec: 'h264', hasAudio: true },
};
const businessConfig: WatermarkBusinessConfig = { ...DEFAULT_CONFIG, text: TEXT };
const videoCanvas = videoCanvasSize(asset);
const videoLayers = toLayers(videoWatermarkLayers(asset, businessConfig));
const videoPlacements = videoWatermarkPlacements(asset, businessConfig);

const content = measureWatermarkTextContent(TEXT, 'Source Han Sans SC', 54);

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'image-brick-dense.svg'), svg(1920, 1080, imageLayers, 'image 1920×1080 · dense · 45°'));
writeFileSync(join(outputDir, 'video-canvas-brick-dense.svg'), svg(videoCanvas.width, videoCanvas.height, videoLayers, 'video canvas 960×540 · dense · 45°'));

writeFileSync(join(outputDir, 'plan.json'), JSON.stringify({
  text: TEXT,
  contentBox: content,
  image: { canvas: { width: 1920, height: 1080 }, instances: imageLayers.length, minCenterDistance: minDistance(imageLayers) },
  video: { canvas: videoCanvas, instances: videoLayers.length, placements: videoPlacements.length, minCenterDistance: minDistance(videoLayers) },
}, null, 2));

console.log(JSON.stringify({
  outputDir,
  imageInstances: imageLayers.length,
  videoCanvasInstances: videoLayers.length,
  videoPlacements: videoPlacements.length,
  contentBox: content,
  minImageCenterDistance: minDistance(imageLayers),
}, null, 2));
