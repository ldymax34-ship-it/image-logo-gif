import { useEffect, useRef } from 'react';
import type { Canvas, Rect } from 'fabric';
import {
  createTransformBaseline,
  fromFabricFrameWithBaseline,
  toConstrainedFabricFrame,
  type CanvasRect,
  type CustomObjectTransform,
  type TransformBaseline
} from './customFabricCoords';
import { resolveCustomFabricReconcilePlan, type CustomFabricObjectId, type CustomFabricOverlayItem } from './customFabricItems';

export type { CustomFabricObjectId, CustomFabricOverlayItem } from './customFabricItems';

type FabricRect = Rect & { __customObjectId?: CustomFabricObjectId };
type FabricConstructor = typeof import('fabric');
type OverlayView = {
  canvas: { width: number; height: number };
  previewScale: number;
  selectedId?: CustomFabricObjectId;
};

export const CUSTOM_FABRIC_CORNER_CONTROLS = { tl: true, tr: true, bl: true, br: true, ml: false, mr: false, mt: false, mb: false, mtr: false };
export const CUSTOM_FABRIC_CANVAS_OPTIONS = {
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

function applyFrame(target: FabricRect, frame: ReturnType<typeof toConstrainedFabricFrame>) {
  target.set({ left: frame.left, top: frame.top, width: frame.width, height: frame.height, scaleX: frame.scaleX, scaleY: frame.scaleY });
  target.setCoords();
}

function createInteractionObject(FabricRectConstructor: FabricConstructor['Rect'], item: CustomFabricOverlayItem, previewScale: number): FabricRect {
  const frame = toConstrainedFabricFrame(
    { x: item.rect.x, y: item.rect.y, scale: item.currentScale },
    item.rect,
    previewScale,
    item.currentScale
  );
  const object = new FabricRectConstructor({
    ...frame,
    originX: 'left',
    originY: 'top',
    fill: 'rgba(0,0,0,0.001)',
    stroke: 'rgba(0,0,0,0)',
    strokeWidth: 0,
    transparentCorners: false,
    cornerColor: '#60a5fa',
    cornerStrokeColor: '#e0f2fe',
    borderColor: '#60a5fa',
    cornerSize: 10,
    cornerStyle: 'circle',
    padding: 2,
    lockRotation: true,
    lockSkewingX: true,
    lockSkewingY: true,
    lockScalingFlip: true,
    hasRotatingPoint: false,
    visible: item.visible
  }) as FabricRect;
  object.__customObjectId = item.id;
  object.setControlsVisibility(CUSTOM_FABRIC_CORNER_CONTROLS);
  return object;
}

function reconcileObjects({
  instance,
  FabricRectConstructor,
  objects,
  items,
  canvas,
  previewScale,
  selectedId,
  isTransforming
}: {
  instance: Canvas;
  FabricRectConstructor: FabricConstructor['Rect'];
  objects: Map<CustomFabricObjectId, FabricRect>;
  items: CustomFabricOverlayItem[];
  canvas: { width: number; height: number };
  previewScale: number;
  selectedId?: CustomFabricObjectId;
  isTransforming: boolean;
}): { selectedId?: CustomFabricObjectId; removed: CustomFabricObjectId[] } {
  instance.setDimensions({ width: canvas.width * previewScale, height: canvas.height * previewScale });
  const active = instance.getActiveObject() as FabricRect | undefined;
  const activeId = active?.__customObjectId;
  const plan = resolveCustomFabricReconcilePlan(items, objects.keys(), activeId);

  for (const id of plan.remove) {
    const object = objects.get(id);
    if (object) instance.remove(object);
    objects.delete(id);
  }
  for (const item of plan.create) {
    const object = createInteractionObject(FabricRectConstructor, item, previewScale);
    objects.set(item.id, object);
    instance.add(object);
  }
  for (const item of plan.update) {
    const object = objects.get(item.id);
    if (!object) continue;
    object.set({ visible: item.visible });
    if (!isTransforming) {
      applyFrame(object, toConstrainedFabricFrame(
        { x: item.rect.x, y: item.rect.y, scale: item.currentScale },
        item.rect,
        previewScale,
        item.currentScale
      ));
    }
  }

  const selected = selectedId ? objects.get(selectedId) : undefined;
  if (plan.discardActive || !selectedId || !selected?.visible) instance.discardActiveObject();
  else if (instance.getActiveObject() !== selected) instance.setActiveObject(selected);
  instance.requestRenderAll();

  return {
    selectedId: plan.remove.includes(selectedId as CustomFabricObjectId) ? undefined : selectedId,
    removed: plan.remove
  };
}

/**
 * Transparent Fabric interaction layer. It draws no production artwork: the
 * board below remains the sole visual and export Render Plan consumer.
 */
export function CustomFabricOverlay({
  canvas,
  previewScale,
  items,
  selectedId,
  onSelectedIdChange,
  onTransformChange,
  onSnapTransform,
  onError,
  disabled = false
}: {
  canvas: { width: number; height: number };
  previewScale: number;
  items: CustomFabricOverlayItem[];
  selectedId?: CustomFabricObjectId;
  onSelectedIdChange: (id: CustomFabricObjectId | undefined) => void;
  onTransformChange: (id: CustomFabricObjectId, transform: CustomObjectTransform) => void;
  onSnapTransform?: (id: CustomFabricObjectId, transform: CustomObjectTransform, item: CustomFabricOverlayItem) => CustomObjectTransform;
  onError?: (message: string) => void;
  /** Crop mode leaves pointer events to BoardCanvas; object state remains reconciled. */
  disabled?: boolean;
}) {
  const elementRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const objectRefs = useRef(new Map<CustomFabricObjectId, FabricRect>());
  const latestItemsRef = useRef(items);
  const latestViewRef = useRef<OverlayView>({ canvas, previewScale, selectedId });
  const callbacksRef = useRef({ onSelectedIdChange, onTransformChange, onSnapTransform, onError });
  const isTransformingRef = useRef(false);
  const transformBaselineRef = useRef<TransformBaseline>();
  const fabricModuleRef = useRef<FabricConstructor>();

  latestItemsRef.current = items;
  latestViewRef.current = { canvas, previewScale, selectedId };
  callbacksRef.current = { onSelectedIdChange, onTransformChange, onSnapTransform, onError };

  useEffect(() => {
    let disposed = false;
    let instance: Canvas | undefined;

    void import('fabric').then((fabric) => {
      if (disposed || !elementRef.current) return;
      fabricModuleRef.current = fabric;
      instance = new fabric.Canvas(elementRef.current, CUSTOM_FABRIC_CANVAS_OPTIONS);
      fabricCanvasRef.current = instance;

      const getId = (target?: unknown) => (target as FabricRect | undefined)?.__customObjectId;
      const updateSelection = () => callbacksRef.current.onSelectedIdChange(getId(instance?.getActiveObject()));
      const writeTransform = (target?: unknown) => {
        const object = target as FabricRect | undefined;
        const id = getId(object);
        const baseline = transformBaselineRef.current;
        if (!object || !id || !baseline || baseline.id !== id) return;
        const transform = fromFabricFrameWithBaseline(
          { left: object.left ?? 0, top: object.top ?? 0, width: object.width, height: object.height, scaleX: object.scaleX, scaleY: object.scaleY },
          baseline
        );
        const item: CustomFabricOverlayItem = {
          id,
          rect: baseline.rect,
          visible: true,
          currentScale: baseline.currentScale,
          minScale: baseline.minScale,
          maxScale: baseline.maxScale
        };
        const snapped = callbacksRef.current.onSnapTransform?.(id, transform, item) ?? transform;
        applyFrame(object, toConstrainedFabricFrame(snapped, baseline.rect, baseline.previewScale, baseline.currentScale));
        callbacksRef.current.onTransformChange(id, snapped);
      };

      instance.on('before:transform', ({ transform }) => {
        const id = getId(transform.target);
        const item = id ? latestItemsRef.current.find((candidate) => candidate.id === id) : undefined;
        if (!id || !item) return;
        const view = latestViewRef.current;
        isTransformingRef.current = true;
        // One gesture always resolves against this immutable Render Plan frame.
        // React may reconcile a newer rect while Fabric continues emitting
        // scaling events, so never read latestItemsRef from writeTransform.
        transformBaselineRef.current = createTransformBaseline(id, item, view.canvas, view.previewScale);
      });
      instance.on('object:moving', ({ target }) => writeTransform(target));
      instance.on('object:scaling', ({ target }) => writeTransform(target));
      instance.on('object:modified', ({ target }) => {
        writeTransform(target);
        transformBaselineRef.current = undefined;
        isTransformingRef.current = false;
        // The React state write above is the source of truth. Its next items
        // effect reconciles this object from the final Render Plan frame.
      });
      instance.on('selection:created', updateSelection);
      instance.on('selection:updated', updateSelection);
      instance.on('selection:cleared', () => callbacksRef.current.onSelectedIdChange(undefined));

      reconcileObjects({
        instance,
        FabricRectConstructor: fabric.Rect,
        objects: objectRefs.current,
        items: latestItemsRef.current,
        canvas,
        previewScale,
        selectedId,
        isTransforming: false
      });
    }).catch(() => {
      if (!disposed) callbacksRef.current.onError?.('固定对象交互层加载失败，仍可预览和导出。');
    });

    return () => {
      disposed = true;
      objectRefs.current.clear();
      transformBaselineRef.current = undefined;
      fabricCanvasRef.current = null;
      void instance?.dispose();
    };
  }, [canvas.height, canvas.width]);

  useEffect(() => {
    const instance = fabricCanvasRef.current;
    const fabric = fabricModuleRef.current;
    if (!instance || !fabric) return;
    const result = reconcileObjects({
      instance,
      FabricRectConstructor: fabric.Rect,
      objects: objectRefs.current,
      items,
      canvas,
      previewScale,
      selectedId,
      isTransforming: isTransformingRef.current
    });
    const baseline = transformBaselineRef.current;
    if (baseline && result.removed.includes(baseline.id)) transformBaselineRef.current = undefined;
    if (result.selectedId !== selectedId) onSelectedIdChange(result.selectedId);
  }, [canvas, items, onSelectedIdChange, previewScale, selectedId]);

  useEffect(() => {
    if (!disabled) return;
    const instance = fabricCanvasRef.current;
    if (!instance) return;
    instance.discardActiveObject();
    instance.requestRenderAll();
  }, [disabled]);

  return <div className={`custom-fabric-overlay ${disabled ? 'is-disabled' : ''}`} aria-label="固定对象交互层"><canvas ref={elementRef} /></div>;
}

export { createInteractionObject, reconcileObjects };
