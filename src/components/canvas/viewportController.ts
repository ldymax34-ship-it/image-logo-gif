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

/** Converts a client-space pointer using the rendered canvas DOM rect. */
export function pointerToCanvasPoint(
  clientX: number,
  clientY: number,
  canvasRect: Pick<CanvasRect, 'left' | 'top'>,
  scale: number
): { x: number; y: number } {
  return { x: (clientX - canvasRect.left) / scale, y: (clientY - canvasRect.top) / scale };
}

export function getViewportScale(zoom: number): number {
  return zoom / 100;
}

export function getViewportFitZoom(stage: ViewportSize, canvas: ViewportSize, padding = 36): number {
  const usableWidth = Math.max(1, stage.width - padding);
  const usableHeight = Math.max(1, stage.height - padding);
  return Math.max(1, Math.min(300, Math.min(usableWidth / canvas.width, usableHeight / canvas.height) * 100));
}

export function createFitViewport(stage: ViewportSize, canvas: ViewportSize): ViewportState {
  return { zoom: getViewportFitZoom(stage, canvas), panX: 0, panY: 0, mode: 'fit' };
}

/** Keeps a canvas reachable while centering it whenever it is smaller than its stage. */
export function clampViewport(viewport: ViewportState, stage: ViewportSize, canvas: ViewportSize): ViewportState {
  const scale = getViewportScale(viewport.zoom);
  const clampAxis = (pan: number, stageLength: number, canvasLength: number) => {
    if (canvasLength <= stageLength) return 0;
    const limit = Math.max(0, (stageLength + canvasLength) / 2 - Math.min(MIN_VISIBLE_PX, canvasLength));
    return Math.min(limit, Math.max(-limit, pan));
  };
  return {
    ...viewport,
    panX: clampAxis(viewport.panX, stage.width, canvas.width * scale),
    panY: clampAxis(viewport.panY, stage.height, canvas.height * scale)
  };
}

export function centerViewportOnCanvasPoint(
  stage: ViewportSize,
  canvas: ViewportSize,
  zoom: number,
  point: { x: number; y: number }
): ViewportState {
  const scale = getViewportScale(zoom);
  return clampViewport({
    zoom,
    panX: (canvas.width / 2 - point.x) * scale,
    panY: (canvas.height / 2 - point.y) * scale,
    mode: 'manual'
  }, stage, canvas);
}

/** Pointer-anchored zoom using the actual rendered canvas rect. */
export function computePointerZoomViewport(
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

/** Pointer zoom from a centered stage when the latest DOM rect has not rendered yet. */
export function computePointerZoomViewportFromStage(
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
