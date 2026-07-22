import type { CanvasSize, LayoutRect } from '../layout/layoutProfile';
import { createBrandGrid } from './brandGrid';
import { getLogoPlacementBounds } from './brandLayout'
import type { LogoConstraintMode } from './brandTypes';

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
  threshold: number,
  constraintMode: LogoConstraintMode = 'safe-area'
): SnapResult {
  const bounds = getLogoPlacementBounds(canvas, rect, constraintMode);
  const clampedX = Math.min(bounds.maxX, Math.max(bounds.minX, position.x));
  const clampedY = Math.min(bounds.maxY, Math.max(bounds.minY, position.y));
  const grid = createBrandGrid(canvas);
  const isCanvas = constraintMode === 'canvas';
  const xTargets = [
    { value: bounds.minX, name: isCanvas ? 'left' : 'left' },
    { value: (canvas.width - rect.width) / 2, name: 'center' },
    { value: bounds.maxX, name: isCanvas ? 'right' : 'right' }
  ];
  const yTargets = [
    { value: bounds.minY, name: 'top' },
    { value: (canvas.height - rect.height) / 2, name: 'center' },
    { value: bounds.maxY, name: isCanvas ? 'bottom' : 'bottom-safe' }
  ];
  const xTarget = nearest(clampedX, xTargets, threshold);
  const yTarget = nearest(clampedY, yTargets, threshold);
  return {
    x: xTarget.value,
    y: yTarget.value,
    snappedX: xTarget.name as SnapResult['snappedX'],
    snappedY: yTarget.name as SnapResult['snappedY']
  };
}
