import type { BrandAsset } from './brandAsset';
import { DEFAULT_BRAND_EFFECT, getCprRenderColor } from './brandDefaults';
import { createBrandGrid, getBrandGuideLines, getGridSafeArea } from './brandGrid';
import { CPR_PRESET, getBrandColor } from './cprPreset';
import type { BrandRenderPlan, BrandPlacement, CprState, LogoGroupState } from './brandTypes';
import type { CanvasSize, LayoutRect } from '../layout/layoutProfile';

function groupDimensions(gridUnit: number, group: LogoGroupState, company?: BrandAsset, game?: BrandAsset) {
  const width = gridUnit * (group.placement === 'center' ? 4 : 2) * (group.sizePreset === 'small' ? .85 : group.sizePreset === 'large' ? 1.15 : 1);
  const aspect = group.mode === 'company-and-game' ? 3.4 : (group.mode === 'company-only' ? company?.aspectRatio : game?.aspectRatio) ?? 3;
  return { width, height: width / aspect };
}

function placeGroup(canvas: CanvasSize, width: number, height: number, placement: BrandPlacement, offset?: { x: number; y: number }): LayoutRect {
  const grid = createBrandGrid(canvas); const margin = grid.unit;
  if (placement === 'center') return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
  if (placement === 'corner-left') return { x: margin, y: margin, width, height };
  if (placement === 'custom' && offset) return { x: Math.max(margin, Math.min(canvas.width - width - margin, offset.x)), y: Math.max(margin, Math.min(canvas.height - height - margin, offset.y)), width, height };
  return { x: canvas.width - width - margin, y: margin, width, height };
}

export type BuildBrandRenderOptions = {
  companyLogo?: BrandAsset;
  gameLogo?: BrandAsset;
  /** 0.1.16+：CPR 独立状态。提供时按其 placement/colorMode/effect 渲染，不继承 Logo 坐标。 */
  cpr?: CprState;
  /** 旧入口兼容：仅当未提供 cpr 时回退为默认底部居中、白色、无效果的 CPR。 */
  cprEnabled?: boolean;
  /** Logo 组合效果（保留旧入口）。 */
  effect?: typeof DEFAULT_BRAND_EFFECT;
};

/**
 * 计算 CPR 独立位置：固定尺寸、固定 SVG，底部三档对齐，均离底边和侧边 1 格。
 * 此函数为纯函数，预览与导出共用，确保结果一致。
 */
export function computeCprPlacementRect(canvas: CanvasSize, placement: CprState['placement']): LayoutRect {
  const grid = createBrandGrid(canvas);
  const cprWidth = grid.unit * 5.5;
  const cprHeight = cprWidth / (CPR_PRESET.viewBox.width / CPR_PRESET.viewBox.height);
  const y = canvas.height - grid.unit - cprHeight;
  const x = placement === 'bottom-left'
    ? grid.unit
    : placement === 'bottom-right'
      ? canvas.width - grid.unit - cprWidth
      : (canvas.width - cprWidth) / 2;
  return { x, y, width: cprWidth, height: cprHeight };
}

function buildCprItem(canvas: CanvasSize, cpr: CprState): NonNullable<BrandRenderPlan['cpr']> {
  const rect = computeCprPlacementRect(canvas, cpr.placement);
  const color = getCprRenderColor(cpr.colorMode) ?? '#ffffff';
  return { id: 'cpr:fixed', kind: 'cpr', rect, color, effect: { ...cpr.effect, colorEnabled: cpr.colorMode !== 'original', color } };
}

export function buildBrandRenderPlan(canvas: CanvasSize, group: LogoGroupState, options: BuildBrandRenderOptions = {}): BrandRenderPlan {
  const grid = createBrandGrid(canvas); const color = getBrandColor(group.colorMode) ?? '#ffffff';
  const hasCompany = group.mode !== 'game-only' && options.companyLogo; const hasGame = group.mode !== 'company-only' && options.gameLogo;
  const cprState = options.cpr ?? (options.cprEnabled ? { enabled: true, placement: 'bottom-center' as const, colorMode: 'white' as const, effect: { ...DEFAULT_BRAND_EFFECT, strokeEnabled: false, glowEnabled: false, shadowEnabled: false } } : undefined);
  const cpr = cprState?.enabled ? buildCprItem(canvas, cprState) : undefined;
  if (!hasCompany && !hasGame) return { grid, logoItems: [], cpr, safeArea: getGridSafeArea(grid), guideLines: getBrandGuideLines(grid) };
  const dimensions = groupDimensions(grid.unit, group, options.companyLogo, options.gameLogo); const rect = placeGroup(canvas, dimensions.width, dimensions.height, group.placement, group.manualOffset);
  const items = [] as BrandRenderPlan['logoItems'];
  if (hasCompany && hasGame) {
    const gap = grid.unit * group.gapUnits; const available = rect.width - gap; const companyWidth = available * .42; const gameWidth = available - companyWidth;
    items.push({ id: `logo:${options.companyLogo!.id}`, kind: 'logo', rect: { x: rect.x, y: rect.y, width: companyWidth, height: rect.height }, color, effect: options.effect ?? DEFAULT_BRAND_EFFECT });
    items.push({ id: `logo:${options.gameLogo!.id}`, kind: 'logo', rect: { x: rect.x + companyWidth + gap, y: rect.y, width: gameWidth, height: rect.height }, color, effect: options.effect ?? DEFAULT_BRAND_EFFECT });
  } else {
    const asset = hasCompany ? options.companyLogo! : options.gameLogo!;
    items.push({ id: `logo:${asset.id}`, kind: 'logo', rect, color, effect: options.effect ?? DEFAULT_BRAND_EFFECT });
  }
  return { grid, logoGroupRect: rect, logoItems: items, cpr, safeArea: getGridSafeArea(grid), guideLines: getBrandGuideLines(grid) };
}

export { CPR_PRESET };
