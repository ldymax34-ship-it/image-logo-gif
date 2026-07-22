/**
 * Pure coordinate functions for the focus workspace viewport.
 *
 * The stage-frame uses `display: grid; place-items: center` which centers
 * the canvas-wrapper inside it. The wrapper is then translated by (panX, panY)
 * and its content is scaled by `scale` (= fitScale × zoom/100).
 *
 * Because of the centering layout, the canvas origin is NOT the stage-frame
 * origin. Instead, we use the BoardCanvas's own getBoundingClientRect(),
 * which already includes the centering offset, padding, and pan.
 *
 * Hit testing:
 *   canvasX = (clientX - canvasRect.left) / scale
 *   canvasRect already contains centering + pan, so no manual pan subtraction.
 *
 * Zoom anchoring (pointer-anchored zoom with centering):
 *   canvasCenter = canvasRect.left + canvasRect.width / 2
 *   nextPan = currentPan + (pointer - canvasCenter) * (1 - nextZoom/curZoom)
 */

export type ViewportState = {
  zoom: number;
  panX: number;
  panY: number;
};

export type CanvasRect = { left: number; top: number; width: number; height: number };

/**
 * Convert a screen-space pointer to canvas-space coordinates.
 * Uses the BoardCanvas's own rect, which already includes centering + pan.
 */
export function pointerToCanvasPoint(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number },
  scale: number
): { x: number; y: number } {
  return {
    x: (clientX - canvasRect.left) / scale,
    y: (clientY - canvasRect.top) / scale
  };
}

/**
 * Compute the next viewport so that the canvas point under the pointer
 * stays fixed after a zoom change, accounting for the centered layout.
 *
 * The canvas is centered in the stage-frame via `place-items: center`.
 * When zoom changes, the canvas size changes and the browser re-centers.
 * Using the canvas center as the zoom anchor:
 *   nextPan = currentPan + (pointer - canvasCenter) * (1 - zoomRatio)
 * where canvasCenter = canvasRect.left + canvasRect.width / 2.
 */
export function computeZoomViewport(
  pointerClientX: number,
  pointerClientY: number,
  canvasRect: CanvasRect,
  currentViewport: ViewportState,
  nextZoom: number
): ViewportState {
  if (nextZoom === currentViewport.zoom) return currentViewport;
  const zoomRatio = nextZoom / currentViewport.zoom;
  const canvasCenterX = canvasRect.left + canvasRect.width / 2;
  const canvasCenterY = canvasRect.top + canvasRect.height / 2;
  return {
    zoom: nextZoom,
    panX: currentViewport.panX + (pointerClientX - canvasCenterX) * (1 - zoomRatio),
    panY: currentViewport.panY + (pointerClientY - canvasCenterY) * (1 - zoomRatio)
  };
}
