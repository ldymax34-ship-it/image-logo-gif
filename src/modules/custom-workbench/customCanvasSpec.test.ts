import { describe, expect, it } from 'vitest';
import { buildBoardRenderPlan, createInitialCropState, panCropState, zoomCropState } from '../../core';
import { MAX_CUSTOM_CANVAS_EDGE, createCustomCanvasSelection, getCustomCanvasOptionValue, resolveCustomCanvasSelection, resolveCustomCanvasSpec, selectCustomCanvasPreset } from './customCanvasSpec';
import { toFabricFrame } from './customFabricCoords';

const landscape = { id: 'landscape', width: 3000, height: 1200 };
const portrait = { id: 'portrait', width: 1200, height: 3000 };
const square = { id: 'square', width: 1600, height: 1600 };

describe('CustomWorkbench canvas size selection', () => {
  it.each([portrait, square])('defaults a newly imported $id image to its original pixels', (asset) => {
    const spec = resolveCustomCanvasSpec(asset, resolveCustomCanvasSelection(), 'png');
    expect(spec).toMatchObject({ id: 'custom-source-image', name: '原图尺寸', width: asset.width, height: asset.height });
  });

  it('keeps an explicit 1920×1080 choice while a replacement source image changes', () => {
    const manual = selectCustomCanvasPreset('custom-manual-1920x1080');
    expect(resolveCustomCanvasSpec(landscape, manual, 'png')).toMatchObject({ width: 1920, height: 1080 });
    expect(resolveCustomCanvasSpec(portrait, manual, 'png')).toMatchObject({ width: 1920, height: 1080 });
  });

  it('keeps an explicit arbitrary 1350×1800 selection while the source image changes', () => {
    const custom = createCustomCanvasSelection(1350, 1800)!;
    expect(getCustomCanvasOptionValue(custom)).toBe('custom');
    expect(resolveCustomCanvasSpec(landscape, custom, 'png')).toMatchObject({ width: 1350, height: 1800 });
    expect(resolveCustomCanvasSpec(portrait, custom, 'jpg')).toMatchObject({ width: 1350, height: 1800, format: 'jpg' });
  });

  it.each([
    [0, 1800],
    [1350, 0],
    [Number.NaN, 1800],
    [1350.5, 1800],
    [MAX_CUSTOM_CANVAS_EDGE + 1, 1800]
  ])('does not create a manual canvas for invalid dimensions %p × %p', (width, height) => {
    expect(createCustomCanvasSelection(width, height)).toBeUndefined();
  });

  it('returns to the current source dimensions immediately when source-following is selected', () => {
    expect(resolveCustomCanvasSpec(square, selectCustomCanvasPreset('source'), 'jpg')).toMatchObject({
      id: 'custom-source-image', width: 1600, height: 1600, format: 'jpg'
    });
  });

  it('migrates missing legacy selection to source-following but retains explicit manual intent', () => {
    expect(resolveCustomCanvasSelection()).toEqual({ mode: 'source' });
    expect(resolveCustomCanvasSelection({ width: 1920, height: 1080 })).toEqual({ mode: 'source' });
    expect(resolveCustomCanvasSelection({ mode: 'manual', manualSpec: { width: 1080, height: 1080 } })).toMatchObject({
      mode: 'manual', manualSpec: { width: 1080, height: 1080 }
    });
  });

  it('provides one selected spec to crop/render-plan/Fabric coordinates', () => {
    const asset = { id: 'asset', fileName: 'portrait.png', objectUrl: 'blob:portrait', width: portrait.width, height: portrait.height, fileSize: 1, mimeType: 'image/png' };
    const spec = resolveCustomCanvasSpec(asset, resolveCustomCanvasSelection(), 'png')!;
    const previewState = { assetId: asset.id, specId: spec.id, fitMode: 'contain' as const, crop: createInitialCropState(asset, spec, 'contain') };
    const plan = buildBoardRenderPlan({
      asset,
      spec,
      previewState,
      brandLayer: { logoEnabled: false, cprEnabled: false, logoLanguage: 'zh-CN', cprLanguage: 'zh-CN', logoAnchor: 'top-right', cprAnchor: 'top-right', logoSize: 'standard', cprSize: 'standard', logoEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 }, cprEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 } }
    });

    expect(plan.canvas).toEqual({ width: portrait.width, height: portrait.height });
    expect(toFabricFrame({ x: 0, y: 0, width: plan.canvas.width, height: plan.canvas.height }, .25)).toMatchObject({ width: 300, height: 750 });
  });

  it('uses an arbitrary manual spec for both the Render Plan and Fabric frame', () => {
    const asset = { id: 'asset', fileName: 'portrait.png', objectUrl: 'blob:portrait', width: portrait.width, height: portrait.height, fileSize: 1, mimeType: 'image/png' };
    const spec = resolveCustomCanvasSpec(asset, createCustomCanvasSelection(1350, 1800)!, 'png')!;
    const previewState = { assetId: asset.id, specId: spec.id, fitMode: 'contain' as const, crop: createInitialCropState(asset, spec, 'contain') };
    const plan = buildBoardRenderPlan({
      asset,
      spec,
      previewState,
      brandLayer: { logoEnabled: false, cprEnabled: false, logoLanguage: 'zh-CN', cprLanguage: 'zh-CN', logoAnchor: 'top-right', cprAnchor: 'top-right', logoSize: 'standard', cprSize: 'standard', logoEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 }, cprEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 } }
    });

    expect(plan.canvas).toEqual({ width: 1350, height: 1800 });
    expect(toFabricFrame({ x: 0, y: 0, width: plan.canvas.width, height: plan.canvas.height }, .25)).toMatchObject({ width: 337.5, height: 450 });
  });

  it('reuses the shared crop logic for contain/cover, dragging, zooming and reset on source and manual canvases', () => {
    const asset = { id: 'asset', fileName: 'wide.png', objectUrl: 'blob:wide', width: 3000, height: 1200, fileSize: 1, mimeType: 'image/png' };
    const source = resolveCustomCanvasSpec(asset, selectCustomCanvasPreset('source'), 'png')!;
    const manual = resolveCustomCanvasSpec(asset, selectCustomCanvasPreset('custom-manual-1920x1080'), 'png')!;
    const sourceContain = createInitialCropState(asset, source, 'contain');
    const manualCover = createInitialCropState(asset, manual, 'cover');
    expect(sourceContain).toMatchObject({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(manualCover.scale).toBeCloseTo(.9);
    const moved = panCropState(asset, manual, manualCover, -80, 24, 'cover');
    const zoomed = zoomCropState(asset, manual, moved, manualCover.scale * 1.4, { x: manual.width / 2, y: manual.height / 2 }, 'cover');
    expect(zoomed.scale).toBeGreaterThan(manualCover.scale);
    expect(createInitialCropState(asset, manual, 'cover')).toEqual(manualCover);
  });
});
