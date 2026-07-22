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

/**
 * 从 BrandEffectState 反推配色档位，用于兼容缺少 colorMode 的旧 JSON。
 * - colorEnabled=false → original
 * - color=#000000 → black
 * - color=#ffffff → white
 * - 其他颜色 → custom
 */
export function deriveBrandColorMode(effect: Pick<BrandEffectState, 'colorEnabled' | 'color'> | null | undefined): BrandColorMode {
  if (!effect?.colorEnabled) return 'original';
  const color = effect.color?.toLowerCase();
  if (color === '#000000') return 'black';
  if (color === '#ffffff') return 'white';
  return 'custom';
}

/** @deprecated Use deriveBrandColorMode. Kept for existing CPR integrations. */
export const deriveCprColorMode = deriveBrandColorMode;

function isBrandColorMode(value: unknown): value is BrandColorMode {
  return value === 'original' || value === 'white' || value === 'black' || value === 'custom';
}

/** Resolves missing or invalid runtime colorMode values from the persisted effect. */
export function resolveBrandColorMode(
  colorMode: unknown,
  effect: Pick<BrandEffectState, 'colorEnabled' | 'color'> | null | undefined
): BrandColorMode {
  return isBrandColorMode(colorMode) ? colorMode : deriveBrandColorMode(effect);
}

/**
 * 统一配色解析：把 colorMode + effect 解析为最终 BrandEffectState。
 * Logo 与 CPR 共用此函数，禁止各写一套分支。
 *
 * - original: colorEnabled=false，保留素材原色
 * - white: colorEnabled=true，渲染 #ffffff
 * - black: colorEnabled=true，渲染 #000000
 * - custom: colorEnabled=true，渲染 effect.color（用户自定义色）
 *
 * 返回的 effect 已是最终效果，渲染层不得再次覆盖颜色。
 */
export function resolveColorEffect(colorMode: unknown, effect: BrandEffectState): BrandEffectState {
  switch (resolveBrandColorMode(colorMode, effect)) {
    case 'original': return { ...effect, colorEnabled: false };
    case 'white': return { ...effect, colorEnabled: true, color: '#ffffff' };
    case 'black': return { ...effect, colorEnabled: true, color: '#000000' };
    case 'custom': return { ...effect, colorEnabled: true };
  }
}

/**
 * 兼容旧 localStorage / 内存中的 BrandLayerState：若缺少 cprState，
 * 由旧字段（cprEnabled / cprAnchor / cprEffect）回退生成独立 CPR 状态，
 * 不再继承 Logo custom 坐标。
 */
export function resolveCprState(layer: BrandLayerState): CprState {
  if (layer.cprState) {
    return {
      ...layer.cprState,
      scale: layer.cprState.scale ?? 1,
      colorMode: resolveBrandColorMode(layer.cprState.colorMode, layer.cprState.effect)
    };
  }
  return {
    enabled: layer.cprEnabled,
    scale: 1,
    transform: { placement: mapLegacyCprAnchor(layer.cprAnchor), offsetX: 0, offsetY: 0 },
    colorMode: deriveBrandColorMode(layer.cprEffect),
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
