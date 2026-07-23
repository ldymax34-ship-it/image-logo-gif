/**
 * Focus keeps its public names while the canvas viewport math lives in the
 * shared interaction foundation used by both editor surfaces.
 */
export {
  centerViewportOnCanvasPoint,
  clampViewport as clampFocusViewport,
  computePointerZoomViewport as computeZoomViewport,
  computePointerZoomViewportFromStage as computeZoomViewportFromStage,
  createFitViewport,
  getViewportFitZoom as getFocusFitZoom,
  getViewportScale as getFocusViewScale,
  pointerToCanvasPoint,
  type CanvasRect,
  type ViewportMode,
  type ViewportSize,
  type ViewportState
} from '../../components/canvas/viewportController';
