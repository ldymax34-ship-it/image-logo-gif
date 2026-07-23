import { describe, expect, it } from 'vitest';
import { FABRIC_CANVAS_OPTIONS, FABRIC_CORNER_CONTROLS, FABRIC_SELECTION_STYLE } from './fabricSelection';
import { fromFabricFrame, toFabricFrame } from './fabricInteraction';
import { computePointerZoomViewportFromStage } from './viewportController';
import { CUSTOM_FABRIC_CANVAS_OPTIONS, CUSTOM_FABRIC_CORNER_CONTROLS, CUSTOM_FABRIC_SELECTION_STYLE } from '../../modules/custom-workbench/CustomFabricOverlay';
import { FOCUS_LOGO_FABRIC_CANVAS_OPTIONS, FOCUS_LOGO_FABRIC_CORNER_CONTROLS, FOCUS_LOGO_FABRIC_SELECTION_STYLE } from '../../modules/media-workbench/FocusLogoFabricOverlay';

describe('shared canvas interaction foundation', () => {
  it('keeps Focus and custom Fabric selection rules on the same token objects', () => {
    expect(CUSTOM_FABRIC_CORNER_CONTROLS).toBe(FABRIC_CORNER_CONTROLS);
    expect(FOCUS_LOGO_FABRIC_CORNER_CONTROLS).toBe(FABRIC_CORNER_CONTROLS);
    expect(CUSTOM_FABRIC_SELECTION_STYLE).toBe(FABRIC_SELECTION_STYLE);
    expect(FOCUS_LOGO_FABRIC_SELECTION_STYLE).toBe(FABRIC_SELECTION_STYLE);
    expect(CUSTOM_FABRIC_CANVAS_OPTIONS).toBe(FABRIC_CANVAS_OPTIONS);
    expect(FOCUS_LOGO_FABRIC_CANVAS_OPTIONS).toBe(FABRIC_CANVAS_OPTIONS);
  });

  it('keeps a pointer canvas point stable across stage-based viewport zoom', () => {
    const before = { zoom: 100, panX: 0, panY: 0 };
    const after = computePointerZoomViewportFromStage(350, 250, { left: 0, top: 0, width: 1000, height: 700 }, before, 200);

    expect(after).toMatchObject({ zoom: 200, panX: 150, panY: 100, mode: 'manual' });
  });

  it('uses logical Fabric coordinates independent of backing-store density', () => {
    const rect = { x: 240, y: 160, width: 320, height: 80 };
    const frame = toFabricFrame(rect, .5, 3);
    const next = fromFabricFrame(frame, { currentScale: 1, minScale: .5, maxScale: 2, previewScale: .5 }, () => ({ minX: 0, minY: 0, maxX: 1600, maxY: 1000 }));

    expect(frame).toMatchObject({ left: 120, top: 80, width: 160, height: 40 });
    expect(next).toEqual({ x: 240, y: 160, scale: 1 });
  });
});
