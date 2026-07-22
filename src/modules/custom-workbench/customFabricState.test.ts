import { describe, expect, it } from 'vitest';
import { buildBoardRenderPlan, computeCprPlacementRect, createDefaultCprState, createDefaultLogoGroup, DEFAULT_BRAND_EFFECT } from '../../core';
import { CUSTOM_FABRIC_CANVAS_OPTIONS, CUSTOM_FABRIC_CORNER_CONTROLS } from './CustomFabricOverlay';
import { toCustomFabricTransformPatch } from './customFabricState';

describe('Fabric interaction domain writes', () => {
  it('writes game, company, and CPR transforms into their independent existing fields', () => {
    expect(toCustomFabricTransformPatch('game', { x: 480, y: 220, scale: 1.2 }, { x: 0, y: 0 }))
      .toEqual({ gameOffset: { x: 480, y: 220 }, gameScale: 1.2 });
    expect(toCustomFabricTransformPatch('company', { x: 1020, y: 240, scale: .8 }, { x: 0, y: 0 }))
      .toEqual({ companyOffset: { x: 1020, y: 240 }, companyScale: .8 });
    expect(toCustomFabricTransformPatch('cpr', { x: 1320, y: 940, scale: 1.4 }, { x: 1280, y: 900 }))
      .toEqual({ cprOffset: { x: 40, y: 40 }, cprScale: 1.4 });
  });

  it('only exposes four equal-scale corners and never a rotation handle', () => {
    expect(CUSTOM_FABRIC_CORNER_CONTROLS).toEqual({
      tl: true, tr: true, bl: true, br: true,
      ml: false, mr: false, mt: false, mb: false, mtr: false
    });
  });

  it('disables multi-selection and any modifier that can relax uniform scaling', () => {
    expect(CUSTOM_FABRIC_CANVAS_OPTIONS).toMatchObject({
      selection: false,
      selectionKey: null,
      uniformScaling: true,
      uniScaleKey: null
    });
  });

  it('produces the same custom position in the formal export plan after a Fabric write-back', () => {
    const patch = toCustomFabricTransformPatch('game', { x: 600, y: 320, scale: 1.5 }, { x: 0, y: 0 });
    const plan = buildBoardRenderPlan({
      asset: { id: 'asset', fileName: 'source.png', objectUrl: 'blob:source', width: 1920, height: 1080, fileSize: 1, mimeType: 'image/png' },
      spec: { id: 'custom', name: 'custom', width: 1920, height: 1080, format: 'png' },
      previewState: { assetId: 'asset', specId: 'custom', fitMode: 'contain', crop: { scale: 1, offsetX: 0, offsetY: 0 } },
      brandLayer: {
        logoEnabled: true,
        cprEnabled: false,
        logoLanguage: 'zh-CN',
        cprLanguage: 'zh-CN',
        logoAnchor: 'top-right',
        cprAnchor: 'top-right',
        logoSize: 'standard',
        cprSize: 'standard',
        logoEffect: DEFAULT_BRAND_EFFECT,
        cprEffect: DEFAULT_BRAND_EFFECT,
        logoGroup: { ...createDefaultLogoGroup(), placement: 'custom', constraintMode: 'canvas', manualOffset: patch.gameOffset, scale: patch.gameScale }
      },
      gameLogoAsset: { id: 'game', type: 'logo', sourceKind: 'image', name: 'game', language: 'zh-CN', sourceUrl: '/game.png', aspectRatio: 3 }
    });

    expect(plan.layers.find((layer) => layer.type === 'logo')?.rect).toMatchObject({ x: 600, y: 320 });
  });

  it('keeps standard CPR inside its safety margin while custom composition CPR may touch the canvas edge', () => {
    const canvas = { width: 1920, height: 1080 };
    const standard = computeCprPlacementRect(canvas, { placement: 'bottom-right', offsetX: 9999, offsetY: 9999 }, 1, 'safe-area');
    const custom = computeCprPlacementRect(canvas, { placement: 'bottom-right', offsetX: 9999, offsetY: 9999 }, 1, 'canvas');
    expect(standard.x + standard.width).toBe(1905);
    expect(standard.y + standard.height).toBe(1065);
    expect(custom.x + custom.width).toBe(1920);
    expect(custom.y + custom.height).toBe(1080);

    const cpr = createDefaultCprState();
    expect(cpr.constraintMode).toBe('safe-area');
  });
});
