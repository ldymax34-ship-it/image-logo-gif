import { describe, expect, it } from 'vitest';
import { normalizeCprForTarget, normalizeLogoForTarget, resolveCropSyncScope, resolveSyncScope } from './syncScope';
import { createDefaultCprState, createDefaultLogoGroup, type BoardBrandStateMap, type BoardPreviewState, type MaterialAsset, type MaterialSpec } from '../../core';

const assets: MaterialAsset[] = [
  { id: 'a', fileName: 'a.png', objectUrl: 'blob:a', width: 1000, height: 1000, fileSize: 1000, mimeType: 'image/png' },
  { id: 'b', fileName: 'b.png', objectUrl: 'blob:b', width: 1000, height: 1000, fileSize: 1000, mimeType: 'image/png' }
];
const specs: MaterialSpec[] = [
  { id: 's300', name: '300x300', width: 300, height: 300, format: 'png' },
  { id: 's300b', name: '300x300-b', width: 300, height: 300, format: 'png' },
  { id: 's600', name: '600x600', width: 600, height: 600, format: 'png' }
];

function states(keys: string[]): BoardBrandStateMap {
  return Object.fromEntries(keys.map((key) => [key, { logo: createDefaultLogoGroup(), cpr: createDefaultCprState() }]));
}

function previewStates(keys: string[]): Record<string, BoardPreviewState> {
  return Object.fromEntries(keys.map((key) => [key, { assetId: key.split(':')[0], specId: key.split(':')[1], fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } }]));
}

describe('resolveSyncScope same-size', () => {
  it('matches width x height across all assets and specs, ignoring format', () => {
    const map = states(['a:s300', 'a:s300b', 'a:s600', 'b:s300', 'b:s600']);
    const result = resolveSyncScope({ assets, specs, boardBrandStates: map, sourceAssetId: 'a', sourceSpecId: 's300', scope: 'same-size', layer: 'logo' });
    expect(result.requested).toBe(3);
    expect(result.targetKeys.sort()).toEqual(['a:s300b', 'b:s300'].sort());
    expect(result.missingKeys).toEqual(['b:s300b']);
  });

  it('describes the target as all other same-size boards', () => {
    const map = states(['a:s300', 'b:s300']);
    const result = resolveSyncScope({ assets, specs, boardBrandStates: map, sourceAssetId: 'a', sourceSpecId: 's300', scope: 'same-size', layer: 'logo' });
    expect(result.targetDescription).toContain('所有其他');
    expect(result.targetDescription).toContain('300 × 300');
  });

  it('excludes the source board', () => {
    const map = states(['a:s300']);
    const result = resolveSyncScope({ assets, specs, boardBrandStates: map, sourceAssetId: 'a', sourceSpecId: 's300', scope: 'same-size', layer: 'logo' });
    expect(result.requested).toBe(3);
    expect(result.targetKeys).toEqual([]);
    expect(result.missingKeys).toHaveLength(3);
  });

  it('reports uninitialized targets as missing', () => {
    const map = states(['a:s300', 'b:s300']);
    const result = resolveSyncScope({ assets, specs, boardBrandStates: map, sourceAssetId: 'a', sourceSpecId: 's300', scope: 'same-size', layer: 'logo' });
    expect(result.requested).toBe(3);
    expect(result.targetKeys).toEqual(['b:s300']);
    expect(result.missingKeys.sort()).toEqual(['a:s300b', 'b:s300b'].sort());
  });
});

describe('resolveSyncScope same-asset', () => {
  it('targets only other specs of the same asset', () => {
    const map = states(['a:s300', 'a:s300b', 'a:s600', 'b:s300']);
    const result = resolveSyncScope({ assets, specs, boardBrandStates: map, sourceAssetId: 'a', sourceSpecId: 's300', scope: 'same-asset', layer: 'cpr' });
    expect(result.requested).toBe(2);
    expect(result.targetKeys.sort()).toEqual(['a:s300b', 'a:s600'].sort());
  });
});

describe('resolveCropSyncScope', () => {
  it('only targets same asset and same width x height', () => {
    const previews = previewStates(['a:s300', 'a:s300b', 'a:s600', 'b:s300']);
    const result = resolveCropSyncScope({ assets, specs, previewStates: previews, sourceAssetId: 'a', sourceSpecId: 's300' });
    expect(result.requested).toBe(1);
    expect(result.targetKeys).toEqual(['a:s300b']);
  });

  it('does not target different assets or different sizes', () => {
    const previews = previewStates(['a:s300', 'b:s300', 'a:s600']);
    const result = resolveCropSyncScope({ assets, specs, previewStates: previews, sourceAssetId: 'a', sourceSpecId: 's300' });
    expect(result.targetKeys).toEqual([]);
  });
});

describe('normalizeLogoForTarget', () => {
  const logo = { ...createDefaultLogoGroup(), placement: 'custom' as const, manualOffset: { x: 100, y: 50 } };

  it('returns the same offset when source and target are the same size', () => {
    const result = normalizeLogoForTarget(logo, { width: 600, height: 600 }, { width: 600, height: 600 });
    expect(result.manualOffset).toEqual({ x: 100, y: 50 });
  });

  it('scales offset proportionally for different resolution (same aspect)', () => {
    // 600→300: scale 0.5
    const result = normalizeLogoForTarget(logo, { width: 600, height: 600 }, { width: 300, height: 300 });
    expect(result.manualOffset).toEqual({ x: 50, y: 25 });
  });

  it('scales offset independently for landscape to portrait', () => {
    // 1920x1080 → 1080x1920
    const wideLogo = { ...createDefaultLogoGroup(), placement: 'custom' as const, manualOffset: { x: 192, y: 54 } };
    const result = normalizeLogoForTarget(wideLogo, { width: 1920, height: 1080 }, { width: 1080, height: 1920 });
    // x: 192 * 1080/1920 = 108; y: 54 * 1920/1080 = 96
    expect(result.manualOffset).toEqual({ x: 108, y: 96 });
  });

  it('does not modify offset for non-custom placement', () => {
    const preset = { ...createDefaultLogoGroup(), placement: 'corner-right' as const };
    const result = normalizeLogoForTarget(preset, { width: 600, height: 600 }, { width: 300, height: 300 });
    expect(result.placement).toBe('corner-right');
    expect(result.manualOffset).toBeUndefined();
  });
});

describe('normalizeCprForTarget', () => {
  const cpr = { ...createDefaultCprState(), transform: { placement: 'custom' as const, offsetX: 20, offsetY: 10 } };

  it('returns the same offset when source and target are the same size', () => {
    const result = normalizeCprForTarget(cpr, { width: 600, height: 600 }, { width: 600, height: 600 });
    expect(result.transform.offsetX).toBe(20);
    expect(result.transform.offsetY).toBe(10);
  });

  it('scales offset proportionally for different sizes', () => {
    const result = normalizeCprForTarget(cpr, { width: 600, height: 600 }, { width: 300, height: 300 });
    expect(result.transform.offsetX).toBe(10);
    expect(result.transform.offsetY).toBe(5);
  });

  it('does not modify offset for non-custom placement', () => {
    const preset = { ...createDefaultCprState(), transform: { placement: 'bottom-right' as const, offsetX: 0, offsetY: 0 } };
    const result = normalizeCprForTarget(preset, { width: 600, height: 600 }, { width: 300, height: 300 });
    expect(result.transform.placement).toBe('bottom-right');
  });
});
