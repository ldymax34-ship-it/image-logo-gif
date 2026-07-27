// @vitest-environment jsdom

import { StrictMode, useState, type ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

class FabricCanvasDomMock {
  backgroundImage: unknown;
  width = 800;
  height = 600;
  private readonly lowerCanvas: HTMLCanvasElement;
  private readonly wrapper: HTMLDivElement;

  constructor(canvas: HTMLCanvasElement) {
    this.lowerCanvas = canvas;
    const host = canvas.parentNode;
    if (!host) throw new Error('canvas host is missing');
    this.wrapper = canvas.ownerDocument.createElement('div');
    this.wrapper.className = 'canvas-container';
    host.replaceChild(this.wrapper, canvas);
    this.wrapper.append(canvas, canvas.ownerDocument.createElement('canvas'));
  }

  on = vi.fn(); off = vi.fn(); clear = vi.fn(); remove = vi.fn(); add = vi.fn();
  renderAll = vi.fn(); requestRenderAll = vi.fn(); discardActiveObject = vi.fn();
  setActiveObject = vi.fn(); getActiveObject = vi.fn(() => undefined);
  setDimensions = vi.fn(({ width, height }: { width: number; height: number }) => { this.width = width; this.height = height; });
  dispose = vi.fn(() => new Promise<boolean>((resolve) => {
    queueMicrotask(() => {
      if (this.wrapper.parentNode) this.wrapper.parentNode.replaceChild(this.lowerCanvas, this.wrapper);
      resolve(true);
    });
  }));
}

vi.mock('fabric', () => ({
  Canvas: FabricCanvasDomMock,
  Rect: class {},
  FabricImage: { fromURL: vi.fn(() => Promise.resolve(undefined)) },
  FabricText: class {},
  Shadow: class {}
}));
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://localhost/${path}`, invoke: vi.fn() }));
vi.mock('../canvas/fabricSelection', () => ({ FABRIC_CANVAS_OPTIONS: {}, FABRIC_CORNER_CONTROLS: {}, FABRIC_SELECTION_STYLE: {} }));
vi.mock('../../components/canvas/fabricSelection', () => ({ FABRIC_CANVAS_OPTIONS: {}, FABRIC_CORNER_CONTROLS: {}, FABRIC_SELECTION_STYLE: {} }));
vi.mock('../../gif-media/mediaDesktop', () => ({ isMediaDesktopAvailable: () => false, loadMediaDesktopApi: vi.fn() }));

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

import { FocusLogoFabricOverlay } from '../../modules/media-workbench/FocusLogoFabricOverlay';
import { CustomFabricOverlay } from '../../modules/custom-workbench/CustomFabricOverlay';
import { WatermarkWorkbench } from '../../watermark-workbench/WatermarkWorkbench';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mountThenReturn(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<StrictMode>{element}</StrictMode>); });
  for (let attempt = 0; attempt < 10 && !container.querySelector('.canvas-container'); attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  expect(container.querySelector('.canvas-container')).not.toBeNull();
  expect(() => act(() => root.unmount())).not.toThrow();
  await act(async () => { await Promise.resolve(); });
  expect(container.childElementCount).toBe(0);
  container.remove();
}

describe('Fabric component lifecycle', () => {
  it('returns from Focus logo after Fabric reparents the canvas', async () => {
    await mountThenReturn(<FocusLogoFabricOverlay
      canvas={{ width: 100, height: 100 }} rect={undefined} previewScale={1} currentScale={1}
      constraintMode="safe-area" selected={false} onSelectedChange={() => {}}
      onTransformChange={() => {}} onTransformingChange={() => {}}
    />);
  });

  it('returns from custom layout after Fabric reparents the canvas', async () => {
    await mountThenReturn(<CustomFabricOverlay
      canvas={{ width: 100, height: 100 }} previewScale={1} items={[]} selectedId={undefined}
      onSelectedIdChange={() => {}} onTransformChange={() => {}}
    />);
  });

  it('returns from watermark after Fabric reparents the canvas', async () => {
    await mountThenReturn(<WatermarkWorkbench onReturn={() => {}} />);
  });

  it('can switch from a Fabric-owned tool host back to the home node under StrictMode', async () => {
    function Switcher() {
      const [tool, setTool] = useState(true);
      return tool ? <><FocusLogoFabricOverlay
        canvas={{ width: 100, height: 100 }} rect={undefined} previewScale={1} currentScale={1}
        constraintMode="safe-area" selected={false} onSelectedChange={() => {}}
        onTransformChange={() => {}} onTransformingChange={() => {}}
      /><button onClick={() => setTool(false)}>返回</button></> : <main>工具箱首页</main>;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<StrictMode><Switcher /></StrictMode>); await Promise.resolve(); });
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(() => act(() => button?.click())).not.toThrow();
    expect(container.textContent).toContain('工具箱首页');
    await act(async () => { root.unmount(); await Promise.resolve(); });
    container.remove();
  });
});
