export const FABRIC_CORNER_CONTROLS = { tl: true, tr: true, bl: true, br: true, ml: false, mr: false, mt: false, mb: false, mtr: false };

export const FABRIC_CANVAS_OPTIONS = {
  selection: false,
  selectionKey: null,
  preserveObjectStacking: true,
  uniformScaling: true,
  uniScaleKey: null,
  centeredScaling: false,
  defaultCursor: 'default',
  hoverCursor: 'move',
  moveCursor: 'move'
} as const;

export const FABRIC_SELECTION_STYLE = {
  cornerColor: '#f5f8ff',
  cornerStrokeColor: '#3d83d5',
  borderColor: '#3d83d5',
  cornerSize: 10,
  cornerStyle: 'rect' as const,
  padding: 1
} as const;
