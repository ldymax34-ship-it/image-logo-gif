import type { AspectFamily, CanvasSize, LayoutRect } from '../layout/layoutProfile';
import type { BrandLanguage, BrandEffectState } from './brandAsset';

export type LogoGroupMode = 'game-only' | 'company-only' | 'company-and-game';
export type BrandPlacement = 'corner-left' | 'center' | 'corner-right' | 'custom';
export type BrandColorMode = 'white' | 'black' | 'original';
export type BrandSize = 'small' | 'standard' | 'large' | 'xl';
export type CompanyLogoScale = 'small' | 'match' | 'large';

export type CprPlacement = 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * CPR 独立状态：开关、位置、配色、效果。
 * 预览 / 单导出 / 批导出共用同一份状态，不继承 Logo custom 坐标。
 */
export type CprState = {
  enabled: boolean;
  placement: CprPlacement;
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

export type LogoGroupState = {
  mode: LogoGroupMode;
  companyLogoId?: string;
  gameLogoId?: string;
  gameLogoLanguage: BrandLanguage;
  colorMode: BrandColorMode;
  sizePreset: BrandSize;
  companyLogoScale: CompanyLogoScale;
  /** Only used by the custom module; the standard material module keeps presets. */
  gameLogoScale?: number;
  companyLogoScaleFactor?: number;
  gapUnits: number;
  placement: BrandPlacement;
  lastExplicitPlacement?: Exclude<BrandPlacement, 'custom'>;
  manualOffset?: { x: number; y: number };
};

export type BrandSettingsV1 = {
  version: 1;
  defaultLogoGroupMode: LogoGroupMode;
  defaultLanguage: BrandLanguage;
  defaultColorMode: Exclude<BrandColorMode, 'original'>;
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
};

export type BrandGuideLine = { axis: 'x' | 'y'; position: number; kind: 'grid' | 'half-grid' | 'center' | 'safe' | 'anchor' | 'cpr' };
export type BrandRenderItem = { id: string; kind: 'logo' | 'cpr'; rect: LayoutRect; color: string; effect: BrandEffectState };
export type BrandRenderPlan = { grid: BrandGrid; logoGroupRect?: LayoutRect; logoItems: BrandRenderItem[]; cpr?: BrandRenderItem; safeArea: LayoutRect; guideLines: BrandGuideLine[] };
export type BrandCanvas = CanvasSize;
