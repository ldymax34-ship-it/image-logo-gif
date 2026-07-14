import type { CanvasSize, LayoutRect } from '../layout/layoutProfile';
import type { BrandGrid, BrandGuideLine } from './brandTypes';

export function createBrandGrid(canvas: CanvasSize): BrandGrid {
  // 1920x1080 defines a 32x18 reference grid. Other aspect ratios keep the
  // same visual scale by deriving the square unit from the canvas short side.
  const unit = Math.min(canvas.width, canvas.height) / 18;
  return {
    columns: canvas.width / unit,
    unit,
    halfUnit: unit / 2,
    width: canvas.width,
    height: canvas.height,
    rows: canvas.height / unit
  };
}

export function getGridSafeArea(grid: BrandGrid): LayoutRect {
  return { x: grid.unit, y: grid.unit, width: Math.max(0, grid.width - 2 * grid.unit), height: Math.max(0, grid.height - 2 * grid.unit) };
}

export function getBrandGuideLines(grid: BrandGrid, includeHalf = false): BrandGuideLine[] {
  const guides: BrandGuideLine[] = [
    { axis: 'x', position: grid.width / 2, kind: 'center' },
    { axis: 'y', position: grid.height / 2, kind: 'center' }
  ];
  for (let x = 0; x <= grid.width; x += grid.unit) guides.push({ axis: 'x', position: x, kind: 'grid' });
  for (let y = 0; y <= grid.height; y += grid.unit) guides.push({ axis: 'y', position: y, kind: 'grid' });
  if (includeHalf) {
    for (let x = grid.halfUnit; x < grid.width; x += grid.unit) guides.push({ axis: 'x', position: x, kind: 'half-grid' });
    for (let y = grid.halfUnit; y < grid.height; y += grid.unit) guides.push({ axis: 'y', position: y, kind: 'half-grid' });
  }
  return guides;
}
