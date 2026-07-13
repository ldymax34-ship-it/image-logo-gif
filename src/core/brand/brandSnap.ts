import type { CanvasSize, LayoutRect } from '../layout/layoutProfile';
import { createBrandGrid } from './brandGrid';

export type SnapResult = {
  x: number;
  y: number;
  snappedX?: 'left' | 'center' | 'right';
  snappedY?: 'top' | 'center' | 'bottom-safe';
};

function nearest(value: number, targets: Array<{ value: number; name: string }>, threshold: number) {
  return targets.reduce<{ value: number; name?: string; distance: number }>(
    (best, target) => {
      const distance = Math.abs(value - target.value);
      return distance <= threshold && distance < best.distance ? { ...target, distance } : best;
    },
    { value, distance: Number.POSITIVE_INFINITY }
  );
}

export function snapLogoGroupPosition(
  canvas: CanvasSize,
  rect: Pick<LayoutRect, 'width' | 'height'>,
  position: { x: number; y: number },
  threshold: number
): SnapResult {
  const grid = createBrandGrid(canvas);
  const maxX = Math.max(grid.unit, canvas.width - grid.unit - rect.width);
  const maxY = Math.max(grid.unit, canvas.height - grid.unit - rect.height);
  const clampedX = Math.min(maxX, Math.max(grid.unit, position.x));
  const clampedY = Math.min(maxY, Math.max(grid.unit, position.y));
  const xTarget = nearest(clampedX, [
    { value: grid.unit, name: 'left' },
    { value: (canvas.width - rect.width) / 2, name: 'center' },
    { value: canvas.width - grid.unit - rect.width, name: 'right' }
  ], threshold);
  const yTarget = nearest(clampedY, [
    { value: grid.unit, name: 'top' },
    { value: (canvas.height - rect.height) / 2, name: 'center' },
    { value: canvas.height - grid.unit - rect.height, name: 'bottom-safe' }
  ], threshold);
  return {
    x: xTarget.value,
    y: yTarget.value,
    snappedX: xTarget.name as SnapResult['snappedX'],
    snappedY: yTarget.name as SnapResult['snappedY']
  };
}
