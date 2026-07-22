import { DEFAULT_CPR_EFFECT, DEFAULT_LOGO_EFFECT, type BrandEffectState, type BrandLayerState, type BrandLanguage } from './brandAsset';
import type { BrandColorMode, BrandSettingsV1, CprPlacement, CprState, LogoGroupState } from './brandTypes';

export const DEFAULT_BRAND_SETTINGS: BrandSettingsV1 = {
  version: 1, defaultLogoGroupMode: 'game-only', defaultLanguage: 'zh-CN', defaultColorMode: 'white', defaultSize: 'standard',
  logoScaleByLanguage: { 'zh-CN': 1, 'zh-TW': 1, 'ja-JP': 1, 'ko-KR': 1, 'en-US': 1, custom: 1 },
  defaultPlacementByAspect: { landscape: 'corner-right', square: 'corner-right', portrait: 'corner-right' },
  cprEnabled: true, defaultCprPlacement: 'bottom-right', defaultCprColorMode: 'white',
  gridVisible: false, safeAreaVisible: true, guidesVisible: true, snapEnabled: true, snapThreshold: 8, focusWheelSensitivity: 'standard'
};

export const DEFAULT_BRAND_EFFECT: BrandEffectState = { ...DEFAULT_LOGO_EFFECT, colorEnabled: true, color: '#ffffff', strokeEnabled: false, glowEnabled: false, shadowEnabled: false };

/**
 * CPR 默认状态：固定 SVG、固定尺寸、右下、白色、所有效果关闭。
 * 预览 / 单导出 / 批导出共用此默认。
 */
export const DEFAULT_CPR_STATE: CprState = {
  enabled: true,
  scale: 1,
  transform: { placement: 'bottom-right', offsetX: 0, offsetY: 0 },
  colorMode: 'white',
  effect: { ...DEFAULT_CPR_EFFECT, strokeEnabled: false, glowEnabled: false, shadowEnabled: false }
};


export const DEFAULT_BRAND_LAYER: BrandLayerState = {
  logoEnabled: true,
  cprEnabled: true,
  logoLanguage: 'zh-CN',
  cprLanguage: 'zh-CN',
  logoAnchor: 'top-right',
  cprAnchor: 'top-right',
  logoSize: 'standard',
  cprSize: 'standard',
  logoEffect: DEFAULT_LOGO_EFFECT,
  cprEffect: DEFAULT_CPR_EFFECT
};

export function createDefaultLogoGroup(language: BrandLanguage = 'zh-CN'): LogoGroupState {
  return { mode: 'game-only', gameLogoLanguage: language, colorMode: 'white', sizePreset: 'standard', scale: 1, companyLogoScale: 'match', gapUnits: 0.5, placement: 'corner-right', lastExplicitPlacement: 'corner-right', constraintMode: 'safe-area' };
}

/** 创建一份独立的 CPR 默认状态（返回新对象，调用方可安全修改）。 */
export function createDefaultCprState(): CprState {
  return {
    enabled: true,
    scale: 1,
    transform: { placement: 'bottom-right', offsetX: 0, offsetY: 0 },
    colorMode: 'white',
    effect: { ...DEFAULT_CPR_EFFECT, strokeEnabled: false, glowEnabled: false, shadowEnabled: false }
  };
}

/** 旧 cprAnchor（顶部对齐语义）映射为新的底部独立位置。 */
export function mapLegacyCprAnchor(anchor: BrandLayerState['cprAnchor']): CprPlacement {
  if (anchor === 'top-left') return 'bottom-left';
  if (anchor === 'top-right') return 'bottom-right';
  return 'bottom-center';
}

/** 从旧 BrandEffectState 反推 CPR 配色档位。 */
export function deriveCprColorMode(effect: BrandEffectState): BrandColorMode {
  if (!effect.colorEnabled) return 'original';
  if (effect.color.toLowerCase() === '#000000') return 'black';
  return 'white';
}

/**
 * 兼容旧 localStorage / 内存中的 BrandLayerState：若缺少 cprState，
 * 由旧字段（cprEnabled / cprAnchor / cprEffect）回退生成独立 CPR 状态，
 * 不再继承 Logo custom 坐标。
 */
export function resolveCprState(layer: BrandLayerState): CprState {
  if (layer.cprState) return { ...layer.cprState, scale: layer.cprState.scale ?? 1 };
  return {
    enabled: layer.cprEnabled,
    scale: 1,
    transform: { placement: mapLegacyCprAnchor(layer.cprAnchor), offsetX: 0, offsetY: 0 },
    colorMode: deriveCprColorMode(layer.cprEffect),
    effect: { ...layer.cprEffect }
  };
}

export function normalizeLogoGroup(group: LogoGroupState): LogoGroupState {
  return { ...group, scale: group.scale ?? 1, companyLogoScale: group.companyLogoScale ?? 'match' };
}

export function getLanguageLogoScale(settings: BrandSettingsV1, language: BrandLanguage): number {
  const value = settings.logoScaleByLanguage[language];
  return Number.isFinite(value) ? Math.min(3, Math.max(0.5, value)) : 1;
}

/** Keeps the board's manual adjustment while replacing the language-specific visual correction. */
export function applyLanguageLogoScale(group: LogoGroupState, language: BrandLanguage, settings: BrandSettingsV1): LogoGroupState {
  const sourceScale = getLanguageLogoScale(settings, group.gameLogoLanguage);
  const targetScale = getLanguageLogoScale(settings, language);
  return {
    ...group,
    gameLogoLanguage: language,
    scale: ((group.scale ?? 1) / sourceScale) * targetScale
  };
}

/** 把当前 CPR 配色档位转成渲染用的纯色（original 返回 undefined 表示保留原色）。 */
export function getCprRenderColor(colorMode: BrandColorMode): string | undefined {
  if (colorMode === 'white') return '#ffffff';
  if (colorMode === 'black') return '#000000';
  return undefined;
}
