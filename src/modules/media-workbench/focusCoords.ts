/**
 * Pure viewport and coordinate functions for the focus workspace.
 *
 * The stage centers the canvas-wrapper, then applies the viewport pan. The
 * actual BoardCanvas rect already contains both layout centering and pan, so
 * pointer hit testing must never subtract pan a second time.
 */

export type ViewportMode = 'fit' | 'manual';

export type ViewportState = {
  zoom: number;
  panX: number;
  panY: number;
  mode?: ViewportMode;
};

export type CanvasRect = { left: number; top: number; width: number; height: number };
export type ViewportSize = { width: number; height: number };

const MIN_VISIBLE_PX = 48;

/** Convert a client-space pointer using the BoardCanvas's real DOM rect. */
export function pointerToCanvasPoint(
  clientX: number,
  clientY: number,
  canvasRect: Pick<CanvasRect, 'left' | 'top'>,
  scale: number
): { x: number; y: number } {
  return {
    x: (clientX - canvasRect.left) / scale,
    y: (clientY - canvasRect.top) / scale
  };
}

/** The literal canvas scale for a viewport zoom percentage. */
export function getFocusViewScale(zoom: number): number {
  return zoom / 100;
}

/**
 * Fits the complete canvas inside the stage content box. The result is a
 * literal canvas percentage, so 100% remains true 1:1 actual size.
 */
export function getFocusFitZoom(
  stage: ViewportSize,
  canvas: ViewportSize,
  padding = 36
): number {
  const usableWidth = Math.max(1, stage.width - padding);
  const usableHeight = Math.max(1, stage.height - padding);
  return Math.max(1, Math.min(300, Math.min(usableWidth / canvas.width, usableHeight / canvas.height) * 100));
}

export function createFitViewport(stage: ViewportSize, canvas: ViewportSize): ViewportState {
  return { zoom: getFocusFitZoom(stage, canvas), panX: 0, panY: 0, mode: 'fit' };
}

/**
 * Keeps a viewport reachable. Small canvases are always exactly centered;
 * larger canvases may pan, but retain at least 48 CSS pixels in view.
 */
export function clampFocusViewport(
  viewport: ViewportState,
  stage: ViewportSize,
  canvas: ViewportSize
): ViewportState {
  const scale = getFocusViewScale(viewport.zoom);
  const scaledWidth = canvas.width * scale;
  const scaledHeight = canvas.height * scale;
  const clampAxis = (pan: number, stageLength: number, canvasLength: number) => {
    if (canvasLength <= stageLength) return 0;
    const limit = Math.max(0, (stageLength + canvasLength) / 2 - Math.min(MIN_VISIBLE_PX, canvasLength));
    return Math.min(limit, Math.max(-limit, pan));
  };
  return {
    ...viewport,
    panX: clampAxis(viewport.panX, stage.width, scaledWidth),
    panY: clampAxis(viewport.panY, stage.height, scaledHeight)
  };
}

/** Places a canvas-space point at the center of the visible stage. */
export function centerViewportOnCanvasPoint(
  stage: ViewportSize,
  canvas: ViewportSize,
  zoom: number,
  point: { x: number; y: number }
): ViewportState {
  const scale = getFocusViewScale(zoom);
  return clampFocusViewport({
    zoom,
    panX: (canvas.width / 2 - point.x) * scale,
    panY: (canvas.height / 2 - point.y) * scale,
    mode: 'manual'
  }, stage, canvas);
}

/**
 * Pointer-anchored zoom for a centered canvas. `canvasRect` is the current
 * BoardCanvas DOM rect, including the grid-centering layout and current pan.
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
    panY: currentViewport.panY + (pointerClientY - canvasCenterY) * (1 - zoomRatio),
    mode: 'manual'
  };
}

/**
 * The same pointer-anchored zoom math expressed from the stable stage frame.
 * In a `place-items: center` stage, the canvas center is always the stage
 * center plus the viewport pan. This remains valid across coalesced wheel
 * events, where a previous BoardCanvas DOM rect may no longer describe the
 * latest React viewport state.
 */
export function computeZoomViewportFromStage(
  pointerClientX: number,
  pointerClientY: number,
  stageRect: CanvasRect,
  currentViewport: ViewportState,
  nextZoom: number
): ViewportState {
  if (nextZoom === currentViewport.zoom) return currentViewport;
  const zoomRatio = nextZoom / currentViewport.zoom;
  const canvasCenterX = stageRect.left + stageRect.width / 2 + currentViewport.panX;
  const canvasCenterY = stageRect.top + stageRect.height / 2 + currentViewport.panY;
  return {
    zoom: nextZoom,
    panX: currentViewport.panX + (pointerClientX - canvasCenterX) * (1 - zoomRatio),
    panY: currentViewport.panY + (pointerClientY - canvasCenterY) * (1 - zoomRatio),
    mode: 'manual'
  };
}
