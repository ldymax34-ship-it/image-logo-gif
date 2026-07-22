import { describe, expect, it } from 'vitest';
import { getLogoPlacementBounds, placeGroup } from '../../core/brand/brandLayout';

describe('logo placement bounds', () => {
  it('safe-area bounds keep the group one grid unit inside the canvas', () => {
    const bounds = getLogoPlacementBounds({ width: 1920, height: 1080 }, { width: 240, height: 80 }, 'safe-area');
    expect(bounds.minX).toBe(60);
    expect(bounds.minY).toBe(60);
    expect(bounds.maxX).toBe(1920 - 60 - 240);
    expect(bounds.maxY).toBe(1080 - 60 - 80);
  });

  it('canvas bounds allow the group to reach the canvas edge', () => {
    const bounds = getLogoPlacementBounds({ width: 1920, height: 1080 }, { width: 240, height: 80 }, 'canvas');
    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxX).toBe(1920 - 240);
    expect(bounds.maxY).toBe(1080 - 80);
  });

  it('clamps custom placement to safe area by default', () => {
    const rect = placeGroup({ width: 1920, height: 1080 }, 240, 80, 'custom', { x: -100, y: 2000 });
    expect(rect.x).toBe(60);
    expect(rect.y).toBe(1080 - 60 - 80);
  });

  it('allows custom placement outside safe area in canvas mode', () => {
    const rect = placeGroup({ width: 1920, height: 1080 }, 240, 80, 'custom', { x: 5, y: 5 }, 'canvas');
    expect(rect.x).toBe(5);
    expect(rect.y).toBe(5);
  });

  it('presets always stay inside the safe area even in canvas mode', () => {
    const right = placeGroup({ width: 1920, height: 1080 }, 240, 80, 'corner-right', undefined, 'canvas');
    expect(right.x).toBe(1920 - 60 - 240);
    expect(right.y).toBe(60);
  });
});
