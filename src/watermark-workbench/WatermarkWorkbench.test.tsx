import { describe, expect, it, vi } from 'vitest';

vi.mock('fabric', () => ({
  Canvas: vi.fn(() => ({
    on: vi.fn(), off: vi.fn(), dispose: vi.fn(), clear: vi.fn(),
    remove: vi.fn(), add: vi.fn(), renderAll: vi.fn(),
    setDimensions: vi.fn(), getObjects: vi.fn(() => []),
    width: 800, height: 600, getActiveObject: vi.fn(() => null),
  })),
  FabricImage: { fromURL: vi.fn(() => Promise.resolve(null)) },
  FabricText: vi.fn(() => ({ set: vi.fn(), scaleX: 1, scaleY: 1, width: 100, height: 20, left: 0, top: 0 })),
  Shadow: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://localhost/${p}`, invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../components/canvas/fabricSelection', () => ({ FABRIC_CANVAS_OPTIONS: {}, FABRIC_CORNER_CONTROLS: {} }));
vi.mock('../gif-media/mediaDesktop', () => ({ isMediaDesktopAvailable: () => false, loadMediaDesktopApi: vi.fn() }));

import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { WatermarkWorkbench } from './WatermarkWorkbench';

describe('WatermarkWorkbench lifecycle', () => {
  it('renders without crashing', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WatermarkWorkbench, { onReturn: () => {} })
    );
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('素材');
  });

  it('includes all property sections', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WatermarkWorkbench, { onReturn: () => {} })
    );
    expect(markup).toContain('水印类型');
    expect(markup).toContain('位置与变换');
    expect(markup).toContain('外观');
    expect(markup).toContain('平铺');
  });

  it('has accessibility labels on key regions', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WatermarkWorkbench, { onReturn: () => {} })
    );
    expect(markup).toContain('aria-label="素材与任务"');
    expect(markup).toContain('aria-label="水印预览画布"');
    expect(markup).toContain('aria-label="水印属性"');
    expect(markup).toContain('class="wm-fabric-host"');
    expect(markup).not.toContain('<canvas');
  });
});
