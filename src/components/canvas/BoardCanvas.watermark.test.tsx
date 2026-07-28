// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_LAYER, type MaterialAsset, type MaterialSpec } from '../../core';
import { createInitialCropState } from '../../core/image/crop';
import { buildWatermarkRenderLayers, type WatermarkConfig } from '../../core/image/watermarkRenderPlan';
import { BoardCanvas } from './BoardCanvas';

const asset: MaterialAsset = { id: 'background', fileName: 'background.png', objectUrl: 'blob:background', width: 100, height: 50, fileSize: 1, mimeType: 'image/png' };
const spec: MaterialSpec = { id: 'spec', name: 'spec', width: 100, height: 50, format: 'png' };
const previewState = { assetId: asset.id, specId: spec.id, fitMode: 'contain' as const, crop: createInitialCropState(asset, spec, 'contain') };
const config: WatermarkConfig = { kind: 'text', text: '水印', fontFamily: 'Arial', color: '#fff', fontSize: 16, pattern: 'tiled', rotation: 45, opacity: .35, offsetX: 0, offsetY: 0, spacingX: 50, spacingY: 40 };

function render(configValue?: WatermarkConfig) {
  return renderToStaticMarkup(<BoardCanvas
    asset={asset}
    spec={spec}
    previewState={previewState}
    logoAsset={undefined}
    cprAsset={undefined}
    brandLayer={{ ...DEFAULT_BRAND_LAYER, logoEnabled: false, cprEnabled: false }}
    scale={1}
    watermarkConfig={configValue}
  />);
}

describe('BoardCanvas watermark layers', () => {
  it('never auto-wraps watermark text while preserving manual line breaks', () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');
    expect(styles).toMatch(/\.watermark-layer\s*\{[^}]*white-space:pre;/);
    expect(styles).not.toMatch(/\.watermark-layer\s*\{[^}]*white-space:pre-wrap;/);
  });
  it('renders every planned layer with CSS rotation and opacity', () => {
    const markup = render(config);
    const plannedCount = (markup.match(/class="watermark-layer"/g) ?? []).length;
    expect(plannedCount).toBe(buildWatermarkRenderLayers({ width: spec.width, height: spec.height }, config).length);
    expect(markup).toContain('rotate(45deg)');
    expect(markup).toContain('opacity:0.35');
  });

  it('preserves the existing image board DOM when no watermark config is provided', () => {
    const markup = render();
    expect(markup).toContain('class="preview-image"');
    expect(markup).toContain('class="safe-area"');
    expect(markup).not.toContain('watermark-layer');
  });
});
