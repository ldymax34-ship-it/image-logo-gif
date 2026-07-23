import { describe, expect, it } from 'vitest';
import {
  createFocusLogoTransformBaseline,
  fromFocusLogoFabricFrame,
  toConstrainedFocusLogoFabricFrame,
  toFocusLogoFabricFrame
} from './focusLogoFabricCoords';

const RECT = { x: 1200, y: 72, width: 240, height: 80 };

function baseline(
  canvas = { width: 1920, height: 1080 },
  constraintMode: 'safe-area' | 'canvas' = 'safe-area',
  previewScale = 1
) {
  return createFocusLogoTransformBaseline(RECT, 1, canvas, constraintMode, previewScale);
}

describe('Focus Logo Fabric coordinate mapping', () => {
  it.each([.25, 1, 3])('round-trips a Render Plan rect at %s× viewing scale', (previewScale) => {
    const frozen = baseline({ width: 1920, height: 1080 }, 'safe-area', previewScale);
    const result = fromFocusLogoFabricFrame(toFocusLogoFabricFrame(RECT, previewScale), frozen);

    expect(result).toEqual({ x: RECT.x, y: RECT.y, scale: 1 });
  });

  it('writes a drag and uniform corner scale to manualOffset and existing Logo scale', () => {
    const result = fromFocusLogoFabricFrame({
      left: 360,
      top: 120,
      width: 120,
      height: 40,
      scaleX: 1.5,
      scaleY: 1.5
    }, baseline({ width: 1920, height: 1080 }, 'safe-area', .25));

    expect(result).toEqual({ x: 1440, y: 480, scale: 1.5 });
  });

  it.each([
    [{ width: 1920, height: 1080 }, { x: 60, y: 60, scale: 2 }],
    [{ width: 1080, height: 1920 }, { x: 60, y: 60, scale: 2 }],
    [{ width: 1200, height: 1200 }, { x: 66.66666666666667, y: 66.66666666666667, scale: 2 }]
  ] as const)('clamps extreme top-left transforms for %o', (canvas, expected) => {
    const result = fromFocusLogoFabricFrame({
      left: -999,
      top: -999,
      width: RECT.width,
      height: RECT.height,
      scaleX: 99,
      scaleY: 99
    }, baseline(canvas));

    expect(result).toEqual(expected);
  });

  it('keeps a custom canvas-mode Logo fully inside the canvas boundary', () => {
    const result = fromFocusLogoFabricFrame({
      left: 9999,
      top: 9999,
      width: RECT.width,
      height: RECT.height,
      scaleX: 2,
      scaleY: 2
    }, baseline({ width: 1920, height: 1080 }, 'canvas'));

    expect(result).toEqual({ x: 1440, y: 920, scale: 2 });
  });

  it('keeps a scale gesture relative to its frozen Render Plan rect', () => {
    const frozen = baseline();
    const first = fromFocusLogoFabricFrame({ ...toFocusLogoFabricFrame(RECT, 1), scaleX: 1.2, scaleY: 1.2 }, frozen);
    const nextReactRect = { ...RECT, width: RECT.width * 1.2, height: RECT.height * 1.2 };
    expect(nextReactRect.width).toBe(288);

    const second = fromFocusLogoFabricFrame({ ...toFocusLogoFabricFrame(RECT, 1), scaleX: 1.5, scaleY: 1.5 }, frozen);
    expect(first.scale).toBe(1.2);
    expect(second.scale).toBe(1.5);
  });

  it('restores a constrained domain write to the same Fabric frame', () => {
    const frozen = baseline({ width: 1920, height: 1080 }, 'safe-area', .25);
    expect(toConstrainedFocusLogoFabricFrame({ x: 1440, y: 480, scale: 1.5 }, frozen)).toEqual({
      left: 360,
      top: 120,
      width: 60,
      height: 20,
      scaleX: 1.5,
      scaleY: 1.5
    });
  });
});
