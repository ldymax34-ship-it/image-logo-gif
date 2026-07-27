// @vitest-environment jsdom

import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { clearFabricCanvasHost, createFabricCanvasElement } from './fabricHost';

function FabricLikeHost() {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = createFabricCanvasElement(host);
    const wrapper = document.createElement('div');
    const upperCanvas = document.createElement('canvas');

    // Match Fabric CanvasDOMManager: it replaces the supplied lower canvas
    // with a wrapper and moves the lower canvas beneath that wrapper.
    host.replaceChild(wrapper, canvas);
    wrapper.append(canvas, upperCanvas);

    return () => {
      wrapper.removeChild(upperCanvas);
      wrapper.removeChild(canvas);
      if (wrapper.parentNode) wrapper.parentNode.replaceChild(canvas, wrapper);
      clearFabricCanvasHost(host);
    };
  }, []);

  // React deliberately owns only the stable host, never Fabric's canvas.
  return <div ref={hostRef} />;
}

describe('Fabric canvas host', () => {
  it('unmounts after Fabric reparents its canvas without a NotFoundError', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    expect(() => {
      flushSync(() => root.render(<FabricLikeHost />));
      flushSync(() => root.unmount());
    }).not.toThrow();
    expect(container.childElementCount).toBe(0);
    container.remove();
  });
});
