import type { BrandAsset } from './brandAsset';
import { DEFAULT_BRAND_EFFECT, getCprRenderColor } from './brandDefaults';
import { createBrandGrid, getBrandGuideLines, getGridSafeArea } from './brandGrid';
import { CPR_PRESET, getBrandColor } from './cprPreset';
import type { BrandRenderPlan, BrandPlacement, CprState, LogoConstraintMode, LogoGroupState } from './brandTypes';
import { classifyAspect, type CanvasSize, type LayoutRect } from '../layout/layoutProfile';

export function getLogoLanguageScale(canvas: CanvasSize, group: LogoGroupState, game?: BrandAsset): number {
  if (group.mode === 'company-only' || game?.language !== 'en-US') return 1;
  return classifyAspect(canvas) === 'portrait' ? 1.15 : 1.1;
}

function getCompanyHeightMultiplier(group: LogoGroupState): number {
  const preset = group.companyLogoScale === 'small' ? 0.7 : group.companyLogoScale === 'large' ? 0.86 : 0.78;
  return preset * (group.companyLogoScaleFactor ?? 1);
}

function getGroupWidth(canvas: CanvasSize, gridUnit: number, group: LogoGroupState, game?: BrandAsset): number {
  const languageScale = getLogoLanguageScale(canvas, group, game);
  // Every preset shares the same base geometry. This keeps a drag-slider
  // continuous: changing scale never switches to a different sizing formula.
  const presetScale = group.sizePreset === 'small' ? .85 : group.sizePreset === 'large' ? 1.15 : group.sizePreset === 'xl' ? 1.45 : 1;
  const width = gridUnit * (group.placement === 'center' ? 4 : 2) * presetScale * (group.scale ?? 1) * languageScale;
  return Math.min(canvas.width - gridUnit * 2, width);
}

function groupDimensions(canvas: CanvasSize, gridUnit: number, group: LogoGroupState, company?: BrandAsset, game?: BrandAsset) {
  const width = getGroupWidth(canvas, gridUnit, group, game);
  if (group.mode !== 'company-and-game' || !company || !game) {
    const aspect = (group.mode === 'company-only' ? company?.aspectRatio : game?.aspectRatio) ?? 3;
    // Keep the standalone company mark aligned with the same visual hierarchy
    // used by the paired logo group. Previously the selected company size
    // preset was ignored whenever only the company mark was enabled.
    const visualScale = group.mode === 'company-only'
      ? getCompanyHeightMultiplier(group)
      : group.gameLogoScale ?? 1;
    const contentWidth = width * visualScale;
    return { width: contentWidth, height: contentWidth / aspect };
  }
  const gap = gridUnit * group.gapUnits;
  const companyHeightMultiplier = getCompanyHeightMultiplier(group);
  const gameAspect = game.aspectRatio ?? 1.5;
  const companyAspect = company.aspectRatio ?? 4;
  const gameHeight = Math.max(1, (width - gap) / (gameAspect * (group.gameLogoScale ?? 1) + companyAspect * companyHeightMultiplier));
  return { width, height: gameHeight, gameHeight, companyHeight: gameHeight * companyHeightMultiplier, gap };
}

export type LogoPlacementBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  mode: LogoConstraintMode;
};

export function getLogoPlacementBounds(
  canvas: CanvasSize,
  rect: Pick<LayoutRect, 'width' | 'height'>,
  constraintMode: LogoConstraintMode = 'safe-area'
): LogoPlacementBounds {
  const grid = createBrandGrid(canvas);
  if (constraintMode === 'canvas') {
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(0, canvas.width - rect.width),
      maxY: Math.max(0, canvas.height - rect.height),
      mode: 'canvas'
    };
  }
  return {
    minX: grid.unit,
    minY: grid.unit,
    maxX: Math.max(grid.unit, canvas.width - grid.unit - rect.width),
    maxY: Math.max(grid.unit, canvas.height - grid.unit - rect.height),
    mode: 'safe-area'
  };
}

function clampPosition(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function placeGroup(
  canvas: CanvasSize,
  width: number,
  height: number,
  placement: BrandPlacement,
  offset?: { x: number; y: number },
  constraintMode?: LogoConstraintMode
): LayoutRect {
  const grid = createBrandGrid(canvas); const margin = grid.unit;
  if (placement === 'center') return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height };
  if (placement === 'corner-left') return { x: margin, y: margin, width, height };
  if (placement === 'custom' && offset) {
    const bounds = getLogoPlacementBounds(canvas, { width, height }, constraintMode ?? 'safe-area');
    return { x: clampPosition(offset.x, bounds.minX, bounds.maxX), y: clampPosition(offset.y, bounds.minY, bounds.maxY), width, height };
  }
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
export function computeCprPlacementRect(canvas: CanvasSize, transform: CprState['transform'], scale = 1): LayoutRect {
  const grid = createBrandGrid(canvas);
  const cprWidth = grid.unit * 5.5 * scale;
  const cprHeight = cprWidth / (CPR_PRESET.viewBox.width / CPR_PRESET.viewBox.height);
  const safeMargin = grid.unit * .25;
  const recommendedMargin = grid.unit * .5;
  const placement = transform.placement === 'custom' ? 'bottom-right' : transform.placement;
  const baseY = canvas.height - recommendedMargin - cprHeight;
  const baseX = placement === 'bottom-left'
    ? recommendedMargin
    : placement === 'bottom-right'
      ? canvas.width - recommendedMargin - cprWidth
      : (canvas.width - cprWidth) / 2;
  return {
    x: Math.max(safeMargin, Math.min(canvas.width - safeMargin - cprWidth, baseX + transform.offsetX)),
    y: Math.max(safeMargin, Math.min(canvas.height - safeMargin - cprHeight, baseY + transform.offsetY)),
    width: cprWidth,
    height: cprHeight
  };
}

function buildCprItem(canvas: CanvasSize, cpr: CprState): NonNullable<BrandRenderPlan['cpr']> {
  const rect = computeCprPlacementRect(canvas, cpr.transform, cpr.scale ?? 1);
  const color = getCprRenderColor(cpr.colorMode) ?? '#ffffff';
  return { id: 'cpr:fixed', kind: 'cpr', rect, color, effect: { ...cpr.effect, colorEnabled: cpr.colorMode !== 'original', color } };
}

export function buildBrandRenderPlan(canvas: CanvasSize, group: LogoGroupState, options: BuildBrandRenderOptions = {}): BrandRenderPlan {
  group = { ...group, companyLogoScale: group.companyLogoScale ?? 'match' };
  const grid = createBrandGrid(canvas); const color = getBrandColor(group.colorMode) ?? '#ffffff';
  const hasCompany = group.mode !== 'game-only' && options.companyLogo; const hasGame = group.mode !== 'company-only' && options.gameLogo;
  const cprState = options.cpr ?? (options.cprEnabled ? { enabled: true, scale: 1, transform: { placement: 'bottom-right' as const, offsetX: 0, offsetY: 0 }, colorMode: 'white' as const, effect: { ...DEFAULT_BRAND_EFFECT, strokeEnabled: false, glowEnabled: false, shadowEnabled: false } } : undefined);
  const cpr = cprState?.enabled ? buildCprItem(canvas, cprState) : undefined;
  if (!hasCompany && !hasGame) return { grid, logoItems: [], cpr, safeArea: getGridSafeArea(grid), guideLines: getBrandGuideLines(grid) };
  const dimensions = groupDimensions(canvas, grid.unit, group, options.companyLogo, options.gameLogo);
  const rect = placeGroup(canvas, dimensions.width, dimensions.height, group.placement, group.manualOffset, group.constraintMode);
  const items = [] as BrandRenderPlan['logoItems'];
  if (hasCompany && hasGame) {
    const gap = dimensions.gap ?? grid.unit * group.gapUnits;
    const companyHeight = dimensions.companyHeight ?? rect.height * getCompanyHeightMultiplier(group);
    const gameHeight = dimensions.gameHeight ?? rect.height;
    const companyWidth = companyHeight * (options.companyLogo!.aspectRatio ?? 4);
    const gameWidth = gameHeight * (options.gameLogo!.aspectRatio ?? 1.5) * (group.gameLogoScale ?? 1);
    const actualWidth = companyWidth + gap + gameWidth;
    const offsetX = rect.x + Math.max(0, (rect.width - actualWidth) / 2);
    items.push({ id: `logo:${options.companyLogo!.id}`, kind: 'logo', rect: { x: offsetX, y: rect.y + (rect.height - companyHeight) / 2, width: companyWidth, height: companyHeight }, color, effect: options.effect ?? DEFAULT_BRAND_EFFECT });
    items.push({ id: `logo:${options.gameLogo!.id}`, kind: 'logo', rect: { x: offsetX + companyWidth + gap, y: rect.y + (rect.height - gameHeight) / 2, width: gameWidth, height: gameHeight }, color, effect: options.effect ?? DEFAULT_BRAND_EFFECT });
  } else {
    const asset = hasCompany ? options.companyLogo! : options.gameLogo!;
    items.push({ id: `logo:${asset.id}`, kind: 'logo', rect, color, effect: options.effect ?? DEFAULT_BRAND_EFFECT });
  }
  return { grid, logoGroupRect: rect, logoItems: items, cpr, safeArea: getGridSafeArea(grid), guideLines: getBrandGuideLines(grid) };
}

export { CPR_PRESET };
