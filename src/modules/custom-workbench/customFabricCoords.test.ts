import { describe, expect, it } from 'vitest';
import { createTransformBaseline, fromFabricFrame, fromFabricFrameWithBaseline, getCustomObjectScaleLimits, getCustomTransformBounds, toConstrainedFabricFrame, toFabricFrame } from './customFabricCoords';

const RECT = { x: 460, y: 216, width: 320, height: 96 };
const CANVAS = { width: 1920, height: 1080 };

describe('CustomWorkbench Fabric coordinate mapping', () => {
  it.each([0.25, 1, 3])('round-trips Render Plan coordinates at %s× preview scale', (previewScale) => {
    const frame = toFabricFrame(RECT, previewScale);
    const result = fromFabricFrame(frame, RECT, previewScale, 1, CANVAS, 0.6, 3);

    expect(result).toEqual({ x: RECT.x, y: RECT.y, scale: 1 });
  });

  it.each([1, 2, 3])('does not drift when the backing store uses %s× device pixels', (devicePixelRatio) => {
    const frame = toFabricFrame(RECT, 0.25, devicePixelRatio);
    expect(frame).toMatchObject({ left: 115, top: 54, width: 80, height: 24 });
    expect(fromFabricFrame(frame, RECT, 0.25, 1, CANVAS, 0.6, 3)).toEqual({ x: 460, y: 216, scale: 1 });
  });

  it('maps drag and corner scaling back to x/y/scale', () => {
    const result = fromFabricFrame(
      { left: 150, top: 80, width: 80, height: 24, scaleX: 1.5, scaleY: 1.5 },
      RECT,
      0.25,
      1,
      CANVAS,
      0.6,
      3
    );

    expect(result).toEqual({ x: 600, y: 320, scale: 1.5 });
  });

  it('clamps drag and scaling to the canvas boundary', () => {
    const result = fromFabricFrame(
      { left: 9999, top: -10, width: 320, height: 96, scaleX: 3, scaleY: 3 },
      RECT,
      1,
      1,
      CANVAS,
      0.6,
      3
    );

    expect(result).toEqual({ x: 960, y: 0, scale: 3 });
  });

  it('restores an externally updated transform into the same Fabric frame', () => {
    const frame = toConstrainedFabricFrame({ x: 600, y: 320, scale: 1.5 }, RECT, 0.25, 1);
    expect(frame).toEqual({ left: 150, top: 80, width: 80, height: 24, scaleX: 1.5, scaleY: 1.5 });
  });

  it('keeps scaling relative to the frozen gesture baseline after React reconciles a newer plan', () => {
    const baseline = createTransformBaseline('game', {
      rect: RECT,
      currentScale: 1,
      minScale: .6,
      maxScale: 3
    }, CANVAS, 1);

    // A previous scaling event can cause React to reconcile this newer 1.2×
    // Render Plan rect before Fabric delivers its next event. The second
    // event must still be relative to the original 1× gesture baseline.
    const reactReconciledItem = { rect: { ...RECT, width: 384, height: 115.2 }, currentScale: 1.2 };
    expect(reactReconciledItem.currentScale).toBe(1.2);
    const result = fromFabricFrameWithBaseline({
      left: RECT.x,
      top: RECT.y,
      width: RECT.width,
      height: RECT.height,
      scaleX: 1.2,
      scaleY: 1.2
    }, baseline);

    expect(result).toEqual({ x: RECT.x, y: RECT.y, scale: 1.2 });
    expect(result.scale).not.toBe(1.44);
  });

  it('clamps a larger numeric scale at the bottom-right and does not restore an old out-of-bounds offset when scaling down', () => {
    const enlarged = fromFabricFrame(
      { left: 1800, top: 1000, width: RECT.width, height: RECT.height, scaleX: 3, scaleY: 3 },
      RECT, 1, 1, CANVAS, .6, 3
    );
    expect(enlarged).toEqual({ x: 960, y: 792, scale: 3 });
    const smaller = fromFabricFrame(
      { left: enlarged.x, top: enlarged.y, width: RECT.width * 3, height: RECT.height * 3, scaleX: .5, scaleY: .5 },
      { ...RECT, x: enlarged.x, y: enlarged.y, width: RECT.width * 3, height: RECT.height * 3 },
      1, 3, CANVAS, .6, 3
    );
    expect(smaller).toEqual({ x: 960, y: 792, scale: 1.5 });
    expect(getCustomTransformBounds(RECT, 1, CANVAS, 3)).toMatchObject({ maxX: 960, maxY: 792 });
  });

  it.each([
    [{ width: 1920, height: 1080 }, 6],
    [{ width: 1080, height: 1920 }, 3.375],
    [{ width: 1200, height: 1200 }, 3.75]
  ] as const)('uses only the canvas geometry as the maximum scale for %o', (canvas, expectedMax) => {
    expect(getCustomObjectScaleLimits({ x: 0, y: 0, width: 320, height: 96 }, 1, canvas)).toMatchObject({ minScale: .01, maxScale: expectedMax });
    const result = fromFabricFrame(
      { left: 9999, top: 9999, width: 320, height: 96, scaleX: 99, scaleY: 99 },
      { x: 0, y: 0, width: 320, height: 96 }, 1, 1, canvas, .01, 3
    );
    expect(result.scale).toBe(expectedMax);
    expect(result.x + 320 * result.scale).toBeCloseTo(canvas.width);
    expect(result.y + 96 * result.scale).toBeLessThanOrEqual(canvas.height);
  });

  it('repositions a corner object while allowing it to reach the global geometric maximum', () => {
    const result = fromFabricFrame(
      { left: 1600, top: 900, width: 320, height: 96, scaleX: 99, scaleY: 99 },
      RECT, 1, 1, CANVAS, .01, 3
    );
    expect(result.scale).toBe(6);
    expect(result).toMatchObject({ x: 0, y: 504 });
    expect(result.x + RECT.width * result.scale).toBe(CANVAS.width);
    expect(result.y + RECT.height * result.scale).toBe(CANVAS.height);
  });
});
