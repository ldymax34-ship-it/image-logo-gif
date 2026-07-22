import type { AspectFamily, CanvasSize, LayoutRect } from '../layout/layoutProfile';
import type { BrandLanguage, BrandEffectState } from './brandAsset';

export type LogoGroupMode = 'game-only' | 'company-only' | 'company-and-game';
export type BrandPlacement = 'corner-left' | 'center' | 'corner-right' | 'custom';
export type BrandColorMode = 'white' | 'black' | 'original' | 'custom';
export type BrandSize = 'small' | 'standard' | 'large' | 'xl';
export type CompanyLogoScale = 'small' | 'match' | 'large';

export type CprPlacement = 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom';
export type CprConstraintMode = 'safe-area' | 'canvas';

export type CprTransform = {
  placement: CprPlacement;
  offsetX: number;
  offsetY: number;
};

/**
 * CPR 独立状态：开关、位置、配色、效果。
 * 预览 / 单导出 / 批导出共用同一份状态，不继承 Logo custom 坐标。
 */
export type CprState = {
  enabled: boolean;
  /** Continuous visual scale; legacy records default to 1. */
  scale?: number;
  transform: CprTransform;
  /** Standard boards remain inside the CPR safety margin; custom composition may use the full canvas. */
  constraintMode?: CprConstraintMode;
  colorMode: BrandColorMode;
  effect: BrandEffectState;
};

export type BrandGrid = {
  columns: number;
  unit: number;
  halfUnit: number;
  width: number;
  height: number;
  rows: number;
};

export type LogoConstraintMode = 'safe-area' | 'canvas';

export type LogoGroupState = {
  mode: LogoGroupMode;
  companyLogoId?: string;
  gameLogoId?: string;
  gameLogoLanguage: BrandLanguage;
  colorMode: BrandColorMode;
  sizePreset: BrandSize;
  /** Continuous visual scale. Presets only provide the initial scale. */
  scale?: number;
  companyLogoScale: CompanyLogoScale;
  /** Only used by the custom module; the standard material module keeps presets. */
  gameLogoScale?: number;
  companyLogoScaleFactor?: number;
  gapUnits: number;
  placement: BrandPlacement;
  lastExplicitPlacement?: Exclude<BrandPlacement, 'custom'>;
  manualOffset?: { x: number; y: number };
  /** 0.1.31: whether the logo group is constrained to the brand safe-area or may reach the canvas edge. */
  constraintMode?: LogoConstraintMode;
};

export type BoardBrandState = {
  logo: LogoGroupState;
  cpr: CprState;
  /** Per-board visual state. Legacy records omit these and inherit the global defaults. */
  logoEnabled?: boolean;
  logoEffect?: BrandEffectState;
};

export type BoardBrandStateMap = Record<string, BoardBrandState>;

export type BrandSettingsV1 = {
  version: 1;
  defaultLogoGroupMode: LogoGroupMode;
  defaultLanguage: BrandLanguage;
  /** Per-language visual correction applied when switching or exporting Logo resources. */
  logoScaleByLanguage: Record<BrandLanguage, number>;
  defaultColorMode: Exclude<BrandColorMode, 'original' | 'custom'>;
  defaultSize: BrandSize;
  defaultPlacementByAspect: Record<AspectFamily, Exclude<BrandPlacement, 'custom'>>;
  defaultCprPlacement: CprPlacement;
  defaultCprColorMode: BrandColorMode;
  cprEnabled: boolean;
  gridVisible: boolean;
  safeAreaVisible: boolean;
  guidesVisible: boolean;
  snapEnabled: boolean;
  snapThreshold: number;
  /** 0.1.31: focus workspace wheel zoom sensitivity. */
  focusWheelSensitivity?: 'low' | 'standard' | 'high';
};

export type BrandGuideLine = { axis: 'x' | 'y'; position: number; kind: 'grid' | 'half-grid' | 'center' | 'safe' | 'anchor' | 'cpr' };
export type BrandRenderItem = { id: string; kind: 'logo' | 'cpr'; rect: LayoutRect; color: string; effect: BrandEffectState };
export type BrandRenderPlan = { grid: BrandGrid; logoGroupRect?: LayoutRect; logoItems: BrandRenderItem[]; cpr?: BrandRenderItem; safeArea: LayoutRect; guideLines: BrandGuideLine[] };
export type BrandCanvas = CanvasSize;
