import { useEffect, useRef } from 'react';
import type { Canvas, Rect } from 'fabric';
import type { LogoConstraintMode } from '../../core';
import {
  FABRIC_CANVAS_OPTIONS,
  FABRIC_CORNER_CONTROLS,
  FABRIC_SELECTION_STYLE
} from '../../components/canvas/fabricSelection';
import { createFabricCanvasElement, disposeFabricCanvasHost } from '../../components/canvas/fabricHost';
import {
  createFocusLogoTransformBaseline,
  fromFocusLogoFabricFrame,
  toConstrainedFocusLogoFabricFrame,
  toFocusLogoFabricFrame,
  type FocusLogoCanvasRect,
  type FocusLogoTransformBaseline
} from './focusLogoFabricCoords';

type FabricRect = Rect & { __focusLogo?: true };
type FabricConstructor = typeof import('fabric');

export const FOCUS_LOGO_FABRIC_CORNER_CONTROLS = FABRIC_CORNER_CONTROLS;
export const FOCUS_LOGO_FABRIC_CANVAS_OPTIONS = FABRIC_CANVAS_OPTIONS;
export const FOCUS_LOGO_FABRIC_SELECTION_STYLE = FABRIC_SELECTION_STYLE;

type LatestView = {
  canvas: { width: number; height: number };
  rect?: FocusLogoCanvasRect;
  previewScale: number;
  currentScale: number;
  scaleMax: number;
  constraintMode: LogoConstraintMode;
  selected: boolean;
};

function applyFrame(target: FabricRect, frame: ReturnType<typeof toConstrainedFocusLogoFabricFrame>) {
  target.set({ left: frame.left, top: frame.top, width: frame.width, height: frame.height, scaleX: frame.scaleX, scaleY: frame.scaleY });
  target.setCoords();
}

function createFocusLogoObject(
  FabricRectConstructor: FabricConstructor['Rect'],
  rect: FocusLogoCanvasRect,
  previewScale: number
): FabricRect {
  const frame = toFocusLogoFabricFrame(rect, previewScale);
  const object = new FabricRectConstructor({
    ...frame,
    originX: 'left',
    originY: 'top',
    fill: 'rgba(0,0,0,0.001)',
    stroke: 'rgba(0,0,0,0)',
    strokeWidth: 0,
    transparentCorners: false,
    ...FOCUS_LOGO_FABRIC_SELECTION_STYLE,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    lockScalingFlip: true,
    hasRotatingPoint: false
  }) as FabricRect;
  object.__focusLogo = true;
  object.setControlsVisibility(FOCUS_LOGO_FABRIC_CORNER_CONTROLS);
  return object;
}

function reconcileFocusLogo({
  instance,
  FabricRectConstructor,
  object,
  view,
  isTransforming
}: {
  instance: Canvas;
  FabricRectConstructor: FabricConstructor['Rect'];
  object?: FabricRect;
  view: LatestView;
  isTransforming: boolean;
}): FabricRect | undefined {
  instance.setDimensions({ width: view.canvas.width * view.previewScale, height: view.canvas.height * view.previewScale });
  if (!view.rect) {
    if (object) instance.remove(object);
    instance.discardActiveObject();
    instance.requestRenderAll();
    return undefined;
  }

  const nextObject = object ?? createFocusLogoObject(FabricRectConstructor, view.rect, view.previewScale);
  if (!object) instance.add(nextObject);
  if (!isTransforming) {
    const baseline = createFocusLogoTransformBaseline(view.rect, view.currentScale, view.canvas, view.constraintMode, view.previewScale, view.scaleMax);
    applyFrame(nextObject, toConstrainedFocusLogoFabricFrame({ x: view.rect.x, y: view.rect.y, scale: view.currentScale }, baseline));
  }
  if (view.selected) {
    if (instance.getActiveObject() !== nextObject) instance.setActiveObject(nextObject);
  } else if (instance.getActiveObject() === nextObject) {
    instance.discardActiveObject();
  }
  instance.requestRenderAll();
  return nextObject;
}

/** Transparent Focus Logo interaction layer. BoardCanvas remains the visual and export authority. */
export function FocusLogoFabricOverlay({
  canvas,
  rect,
  previewScale,
  currentScale,
  scaleMax,
  constraintMode,
  selected,
  onSelectedChange,
  onTransformChange,
  onTransformingChange,
  onError
}: {
  canvas: { width: number; height: number };
  rect?: FocusLogoCanvasRect;
  previewScale: number;
  currentScale: number;
  scaleMax: number;
  constraintMode: LogoConstraintMode;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onTransformChange: (transform: { x: number; y: number; scale: number }, scaledRect: { width: number; height: number }) => void;
  onTransformingChange: (transforming: boolean) => void;
  onError?: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const objectRef = useRef<FabricRect>();
  const fabricModuleRef = useRef<FabricConstructor>();
  const baselineRef = useRef<FocusLogoTransformBaseline>();
  const transformingRef = useRef(false);
  const hostEpochRef = useRef(0);
  const latestViewRef = useRef<LatestView>({ canvas, rect, previewScale, currentScale, scaleMax, constraintMode, selected });
  const callbacksRef = useRef({ onSelectedChange, onTransformChange, onTransformingChange, onError });

  latestViewRef.current = { canvas, rect, previewScale, currentScale, scaleMax, constraintMode, selected };
  callbacksRef.current = { onSelectedChange, onTransformChange, onTransformingChange, onError };

  useEffect(() => {
    let disposed = false;
    let instance: Canvas | undefined;
    const host = hostRef.current;
    if (!host) return;
    const hostEpoch = ++hostEpochRef.current;
    const element = createFabricCanvasElement(host);

    void import('fabric').then((fabric) => {
      if (disposed) return;
      fabricModuleRef.current = fabric;
      instance = new fabric.Canvas(element, FOCUS_LOGO_FABRIC_CANVAS_OPTIONS);
      fabricCanvasRef.current = instance;

      const writeTransform = (target?: unknown) => {
        const object = target as FabricRect | undefined;
        const baseline = baselineRef.current;
        if (!object || !baseline || !object.__focusLogo) return;
        const transform = fromFocusLogoFabricFrame({
          left: object.left ?? 0,
          top: object.top ?? 0,
          width: object.width,
          height: object.height,
          scaleX: object.scaleX,
          scaleY: object.scaleY
        }, baseline);
        applyFrame(object, toConstrainedFocusLogoFabricFrame(transform, baseline));
        callbacksRef.current.onTransformChange(transform, {
          width: baseline.rect.width * transform.scale / baseline.currentScale,
          height: baseline.rect.height * transform.scale / baseline.currentScale
        });
      };

      instance.on('before:transform', ({ transform }) => {
        const object = transform.target as FabricRect | undefined;
        const view = latestViewRef.current;
        if (!object?.__focusLogo || !view.rect) return;
        baselineRef.current = createFocusLogoTransformBaseline(view.rect, view.currentScale, view.canvas, view.constraintMode, view.previewScale, view.scaleMax);
        transformingRef.current = true;
        callbacksRef.current.onTransformingChange(true);
      });
      instance.on('object:moving', ({ target }) => writeTransform(target));
      instance.on('object:scaling', ({ target }) => writeTransform(target));
      instance.on('object:modified', ({ target }) => {
        writeTransform(target);
        baselineRef.current = undefined;
        transformingRef.current = false;
        callbacksRef.current.onTransformingChange(false);
      });
      instance.on('selection:created', () => callbacksRef.current.onSelectedChange(true));
      instance.on('selection:updated', () => callbacksRef.current.onSelectedChange(true));
      instance.on('selection:cleared', () => callbacksRef.current.onSelectedChange(false));

      objectRef.current = reconcileFocusLogo({
        instance,
        FabricRectConstructor: fabric.Rect,
        object: objectRef.current,
        view: latestViewRef.current,
        isTransforming: false
      });
    }).catch(() => {
      if (!disposed) callbacksRef.current.onError?.('Logo 交互层加载失败，仍可预览和导出。');
    });

    return () => {
      disposed = true;
      objectRef.current = undefined;
      baselineRef.current = undefined;
      transformingRef.current = false;
      fabricCanvasRef.current = null;
      disposeFabricCanvasHost(host, () => instance?.dispose(), () => hostEpochRef.current === hostEpoch && fabricCanvasRef.current !== instance);
    };
  }, [canvas.height, canvas.width]);

  useEffect(() => {
    const instance = fabricCanvasRef.current;
    const fabric = fabricModuleRef.current;
    if (!instance || !fabric) return;
    objectRef.current = reconcileFocusLogo({
      instance,
      FabricRectConstructor: fabric.Rect,
      object: objectRef.current,
      view: latestViewRef.current,
      isTransforming: transformingRef.current
    });
  }, [canvas, constraintMode, currentScale, previewScale, rect, scaleMax, selected]);

  return <div ref={hostRef} className="focus-logo-fabric-overlay" aria-label="Logo 交互层" />;
}

export { createFocusLogoObject, reconcileFocusLogo };
