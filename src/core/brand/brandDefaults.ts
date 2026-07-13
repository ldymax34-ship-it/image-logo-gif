import { DEFAULT_LOGO_EFFECT, type BrandEffectState, type BrandLanguage } from './brandAsset';
import type { BrandSettingsV1, LogoGroupState } from './brandTypes';

export const DEFAULT_BRAND_SETTINGS: BrandSettingsV1 = {
  version: 1, defaultLogoGroupMode: 'game-only', defaultLanguage: 'zh-CN', defaultColorMode: 'white', defaultSize: 'standard',
  defaultPlacementByAspect: { landscape: 'corner-right', square: 'corner-right', portrait: 'corner-right' },
  cprEnabled: false, gridVisible: false, safeAreaVisible: true, guidesVisible: true, snapEnabled: true, snapThreshold: 8
};

export const DEFAULT_BRAND_EFFECT: BrandEffectState = { ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#ffffff', strokeEnabled: false, glowEnabled: false, shadowEnabled: false };

export function createDefaultLogoGroup(language: BrandLanguage = 'zh-CN'): LogoGroupState {
  return { mode: 'game-only', gameLogoLanguage: language, colorMode: 'white', sizePreset: 'standard', gapUnits: 0.5, placement: 'corner-right' };
}
