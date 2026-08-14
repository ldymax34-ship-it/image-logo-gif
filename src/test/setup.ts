class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as Record<string, unknown>).ResizeObserver = TestResizeObserver;
}
if (typeof (globalThis as Record<string, unknown>).PointerEvent === 'undefined') {
  (globalThis as Record<string, unknown>).PointerEvent = (globalThis as Record<string, unknown>).MouseEvent;
}
const ElementCtor = (globalThis as unknown as { Element?: { prototype: { scrollIntoView?: unknown } } }).Element;
if (ElementCtor && typeof ElementCtor.prototype.scrollIntoView !== 'function') {
  ElementCtor.prototype.scrollIntoView = function scrollIntoView() {};
}
