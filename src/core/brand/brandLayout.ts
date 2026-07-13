import type { BrandAsset } from './brandAsset';
import { DEFAULT_BRAND_EFFECT } from './brandDefaults';
import { createBrandGrid, getBrandGuideLines, getGridSafeArea } from './brandGrid';
import { CPR_PRESET, getBrandColor } from './cprPreset';
import type { BrandRenderPlan, BrandPlacement, LogoGroupState } from './brandTypes';
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

export function buildBrandRenderPlan(canvas: CanvasSize, group: LogoGroupState, options: { companyLogo?: BrandAsset; gameLogo?: BrandAsset; cprEnabled: boolean; effect?: typeof DEFAULT_BRAND_EFFECT }): BrandRenderPlan {
  const grid = createBrandGrid(canvas); const color = getBrandColor(group.colorMode) ?? '#ffffff';
  const hasCompany = group.mode !== 'game-only' && options.companyLogo; const hasGame = group.mode !== 'company-only' && options.gameLogo;
  if (!hasCompany && !hasGame) return { grid, logoItems: [], safeArea: getGridSafeArea(grid), guideLines: getBrandGuideLines(grid) };
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
  const cprWidth = grid.unit * 5.5;
  const cprHeight = cprWidth / (CPR_PRESET.viewBox.width / CPR_PRESET.viewBox.height);
  const cprX = group.placement === 'corner-left' ? grid.unit : group.placement === 'corner-right' ? canvas.width - grid.unit - cprWidth : (canvas.width - cprWidth) / 2;
  const cpr = options.cprEnabled ? { id: 'cpr:fixed', kind: 'cpr' as const, rect: { x: cprX, y: canvas.height - grid.unit - cprHeight, width: cprWidth, height: cprHeight }, color, effect: DEFAULT_BRAND_EFFECT } : undefined;
  return { grid, logoGroupRect: rect, logoItems: items, cpr, safeArea: getGridSafeArea(grid), guideLines: getBrandGuideLines(grid) };
}

export { CPR_PRESET };
