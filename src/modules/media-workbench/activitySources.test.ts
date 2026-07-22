import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup, createInitialCropState, type BoardPreviewState } from '../../core';
import { isCustomWorkbenchDirty, type CustomWorkbenchDirtySnapshot } from '../custom-workbench/CustomWorkbench';
import { createFocusSession, isFocusSessionDirty, updateFocusLogo } from './focusSession';
import { DEFAULT_BRAND_SETTINGS } from '../../core';
import { isBrandSettingsDirty } from '../../components/brand/BrandSettingsDialog';

describe('workbench activity sources', () => {
  it('reports focus editor crop drafts and custom imported assets as dirty', () => {
    const asset = { id: 'a', fileName: 'a.png', objectUrl: 'blob:a', width: 100, height: 100, fileSize: 10, mimeType: 'image/png' };
    const spec = { id: 's', name: 's', width: 100, height: 100, format: 'png' as const };
    const initial: BoardPreviewState = { assetId: 'a', specId: 's', fitMode: 'cover', crop: createInitialCropState(asset, spec, 'cover') };
    const draft = { ...initial, crop: { ...initial.crop, offsetX: initial.crop.offsetX + 1 } };
    const logo = createDefaultLogoGroup(); const cpr = createDefaultCprState();
    expect(isFocusSessionDirty({ previewState: initial, brand: { logo, cpr }, brandLayer: { logoEnabled: true, logoEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 } } }, { previewState: draft, brand: { logo, cpr }, brandLayer: { logoEnabled: true, logoEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 } } })).toBe(true);
    const session = createFocusSession('a', 's', 'a:s', { previewState: initial, brand: { logo, cpr }, brandLayer: { logoEnabled: true, logoEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 } } });
    expect(updateFocusLogo(session, { ...logo, scale: 1.2 }).dirty).toBe(true);
    expect(isCustomWorkbenchDirty(asset)).toBe(true);
    expect(isCustomWorkbenchDirty()).toBe(false);
    const customInitial = { canvasSelection: { mode: 'source' as const }, gameEnabled: true, companyEnabled: false, gameScale: 1, companyScale: 1, cprScale: 1, gameOffset: { x: 1, y: 1 }, companyOffset: { x: 2, y: 2 }, cprOffset: { x: 0, y: 0 }, cprEnabled: true, gameEffect: cpr.effect, companyEffect: cpr.effect, cprEffect: cpr.effect, format: 'png' as const, gameLanguage: 'zh-CN' as const, guidesVisible: true, snapEnabled: true } satisfies CustomWorkbenchDirtySnapshot;
    expect(isCustomWorkbenchDirty(undefined, customInitial, { ...customInitial, gameScale: 1.1 })).toBe(true);
    expect(isBrandSettingsDirty(DEFAULT_BRAND_SETTINGS, { ...DEFAULT_BRAND_SETTINGS, snapEnabled: !DEFAULT_BRAND_SETTINGS.snapEnabled })).toBe(true);
  });
});
