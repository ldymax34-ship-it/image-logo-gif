import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup, createInitialCropState, type BoardPreviewState } from '../../core';
import { isCustomWorkbenchDirty, type CustomWorkbenchDirtySnapshot } from '../custom-workbench/CustomWorkbench';
import { isFocusEditorDirty } from './FocusEditorModal';
import { DEFAULT_BRAND_SETTINGS } from '../../core';
import { isBrandSettingsDirty } from '../../components/brand/BrandSettingsDialog';

describe('workbench activity sources', () => {
  it('reports focus editor crop drafts and custom imported assets as dirty', () => {
    const asset = { id: 'a', fileName: 'a.png', objectUrl: 'blob:a', width: 100, height: 100, fileSize: 10, mimeType: 'image/png' };
    const spec = { id: 's', name: 's', width: 100, height: 100, format: 'png' as const };
    const initial: BoardPreviewState = { assetId: 'a', specId: 's', fitMode: 'cover', crop: createInitialCropState(asset, spec, 'cover') };
    const draft = { ...initial, crop: { ...initial.crop, offsetX: initial.crop.offsetX + 1 } };
    const logo = createDefaultLogoGroup(); const cpr = createDefaultCprState();
    expect(isFocusEditorDirty(initial, draft, logo, logo, cpr, cpr)).toBe(true);
    expect(isCustomWorkbenchDirty(asset)).toBe(true);
    expect(isCustomWorkbenchDirty()).toBe(false);
    const customInitial = { gameEnabled: true, companyEnabled: false, gameScale: 1, companyScale: 1, gameOffset: { x: 1, y: 1 }, companyOffset: { x: 2, y: 2 }, cprEnabled: true, gameEffect: cpr.effect, companyEffect: cpr.effect, cprEffect: cpr.effect, format: 'png' as const, gameLanguage: 'zh-CN' as const, guidesVisible: true, snapEnabled: true } satisfies CustomWorkbenchDirtySnapshot;
    expect(isCustomWorkbenchDirty(undefined, customInitial, { ...customInitial, gameScale: 1.1 })).toBe(true);
    expect(isBrandSettingsDirty(DEFAULT_BRAND_SETTINGS, { ...DEFAULT_BRAND_SETTINGS, snapEnabled: !DEFAULT_BRAND_SETTINGS.snapEnabled })).toBe(true);
  });
});
