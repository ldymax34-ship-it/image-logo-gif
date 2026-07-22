import { describe, expect, it } from 'vitest';
import { pointerToCanvasPoint, computeZoomViewport, type CanvasRect } from './focusCoords';

// Simulate real DOM geometry:
//   stage-frame: 1000×700 at (0, 0) with `display:grid; place-items:center`
//   canvas: 600×400 at scale 1 (= zoom 100%)
// The browser centers the canvas-wrapper inside the stage-frame,
// then applies transform: translate(panX, panY).

function canvasRect(zoom: number, panX = 0, panY = 0): CanvasRect {
  const scale = zoom / 100;
  const w = 600 * scale;
  const h = 400 * scale;
  const offsetX = (1000 - w) / 2;
  const offsetY = (700 - h) / 2;
  return { left: offsetX + panX, top: offsetY + panY, width: w, height: h };
}

describe('pointerToCanvasPoint with centered layout', () => {
  it('accounts for centering offset with no pan at 100%', () => {
    // canvas centered at (200, 150), scale 1
    // pointer at (500, 350) → canvas (300, 200)
    const rect = canvasRect(100);
    const point = pointerToCanvasPoint(500, 350, rect, 1);
    expect(point).toEqual({ x: 300, y: 200 });
  });

  it('accounts for pan shifting the canvas rect', () => {
    // pan (50, 30) → canvas at (250, 180)
    // pointer at (500, 350) → canvas (250, 170)
    const rect = canvasRect(100, 50, 30);
    const point = pointerToCanvasPoint(500, 350, rect, 1);
    expect(point).toEqual({ x: 250, y: 170 });
  });

  it('accounts for zoom changing both centering offset and canvas size', () => {
    // zoom 200% → scale 2, canvas 1200×800, centered offset (-100, -50)
    // canvas rect = (-100, -50, 1200, 800)
    // pointer at (500, 350) → canvas ((500-(-100))/2, (350-(-50))/2) = (300, 200)
    const rect = canvasRect(200);
    const point = pointerToCanvasPoint(500, 350, rect, 2);
    expect(point).toEqual({ x: 300, y: 200 });
  });

  it('combines pan and zoom correctly', () => {
    // zoom 200%, pan (50, 30) → canvas at (-50, -20), size 1200×800
    // pointer at (500, 350) → canvas ((500-(-50))/2, (350-(-20))/2) = (275, 185)
    const rect = canvasRect(200, 50, 30);
    const point = pointerToCanvasPoint(500, 350, rect, 2);
    expect(point).toEqual({ x: 275, y: 185 });
  });
});

describe('computeZoomViewport with centered layout', () => {
  it('returns the same viewport when zoom does not change', () => {
    const vp = { zoom: 100, panX: 20, panY: 10 };
    const rect = canvasRect(100, 20, 10);
    const next = computeZoomViewport(500, 350, rect, vp, 100);
    expect(next).toBe(vp);
  });

  it('keeps the canvas point under the pointer fixed when zooming in at canvas center', () => {
    // canvas center = (500, 350), pointer at center
    // zoom 100→200, pan should stay 0
    const rect = canvasRect(100, 0, 0);
    const next = computeZoomViewport(500, 350, rect, { zoom: 100, panX: 0, panY: 0 }, 200);
    expect(next.zoom).toBe(200);
    expect(next.panX).toBe(0);
    expect(next.panY).toBe(0);
    // verify: canvas point before = (500-200)/1 = 300
    // after: canvas at (-100+0, -50+0), pointer at (500, 350) → ((500-(-100))/2, (350-(-50))/2) = (300, 200) ✓
  });

  it('keeps the canvas point under an off-center pointer fixed when zooming in', () => {
    // canvas center = (500, 350), pointer at (350, 250)
    // canvas point before = (350-200)/1 = 150
    // zoomRatio = 2, nextPan = 0 + (350-500)*(1-2) = 150
    const rect = canvasRect(100, 0, 0);
    const next = computeZoomViewport(350, 250, rect, { zoom: 100, panX: 0, panY: 0 }, 200);
    expect(next.zoom).toBe(200);
    expect(next.panX).toBe(150);
    expect(next.panY).toBe(100);
    // verify: after zoom, canvas at (-100+150, -50+100) = (50, 50), size 1200×800
    // canvas point after = (350-50)/2 = 150 ✓
    const afterRect = canvasRect(200, next.panX, next.panY);
    const afterPoint = pointerToCanvasPoint(350, 250, afterRect, 2);
    expect(afterPoint).toEqual({ x: 150, y: 100 });
  });

  it('keeps the canvas point under the pointer fixed with existing pan', () => {
    // pan (50, 30), canvas at (250, 180), center = (250+300, 180+200) = (550, 380)
    // pointer at (350, 250), canvas point before = (350-250)/1 = 100
    // zoomRatio = 2, nextPan = 50 + (350-550)*(1-2) = 50 + 200 = 250
    const rect = canvasRect(100, 50, 30);
    const next = computeZoomViewport(350, 250, rect, { zoom: 100, panX: 50, panY: 30 }, 200);
    // verify: after zoom, canvas at (-100+250, -50+150) = (150, 100), size 1200×800
    // canvas point after = (350-150)/2 = 100 ✓
    const afterRect = canvasRect(200, next.panX, next.panY);
    const afterPoint = pointerToCanvasPoint(350, 250, afterRect, 2);
    expect(afterPoint).toEqual({ x: 100, y: 70 });
  });

  it('does not drift the pointer-anchored canvas point across continuous zoom steps', () => {
    // Start: zoom 100, pan 0, pointer at (350, 250)
    // canvas point = (350-200)/1 = 150
    let vp = { zoom: 100, panX: 0, panY: 0 };
    // Step 1: 100 → 150
    let rect = canvasRect(vp.zoom, vp.panX, vp.panY);
    vp = computeZoomViewport(350, 250, rect, vp, 150);
    // verify
    let afterRect = canvasRect(vp.zoom, vp.panX, vp.panY);
    let scale = vp.zoom / 100;
    let cx = (350 - afterRect.left) / scale;
    let cy = (250 - afterRect.top) / scale;
    expect(Math.round(cx)).toBe(150);
    expect(Math.round(cy)).toBe(100);
    // Step 2: 150 → 200
    rect = canvasRect(vp.zoom, vp.panX, vp.panY);
    vp = computeZoomViewport(350, 250, rect, vp, 200);
    afterRect = canvasRect(vp.zoom, vp.panX, vp.panY);
    scale = vp.zoom / 100;
    cx = (350 - afterRect.left) / scale;
    cy = (250 - afterRect.top) / scale;
    expect(Math.round(cx)).toBe(150);
    expect(Math.round(cy)).toBe(100);
  });
});
