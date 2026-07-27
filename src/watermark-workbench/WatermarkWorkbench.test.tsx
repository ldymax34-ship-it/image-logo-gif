// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
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
const dialogHarness = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: dialogHarness.open }));
vi.mock('../components/canvas/fabricSelection', () => ({ FABRIC_CANVAS_OPTIONS: {}, FABRIC_CORNER_CONTROLS: {} }));
const desktopHarness = vi.hoisted(() => ({ available: false, load: vi.fn(), api: undefined as any }));
vi.mock('../gif-media/mediaDesktop', () => ({
  isMediaDesktopAvailable: () => desktopHarness.available,
  loadMediaDesktopApi: () => desktopHarness.load(),
}));

import { act } from 'react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { WatermarkWorkbench } from './WatermarkWorkbench';

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('WatermarkWorkbench lifecycle', () => {
  function createDesktopApi(overrides: Record<string, unknown> = {}) {
    return {
      getEngineStatus: vi.fn().mockResolvedValue({ ready: true, message: 'ready' }),
      listenTaskEvents: vi.fn().mockResolvedValue(vi.fn()),
      startWatermarkTask: vi.fn().mockResolvedValue({ taskId: 'unused', outputPath: '/tmp/output.png' }),
      cancelTask: vi.fn(),
      ...overrides,
    };
  }

  async function mountWorkbench() {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<WatermarkWorkbench onReturn={() => {}} />); await Promise.resolve(); });
    return { container, root };
  }

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

  it('routes both formal image preview chains through the local Blob helper', () => {
    const source = readFileSync(`${process.cwd()}/src/watermark-workbench/WatermarkWorkbench.tsx`, 'utf8');
    const formalPreviewSection = source.slice(source.indexOf('/* ── load image ── */'), source.indexOf('async function copyFileUrlDiagnostics'));
    expect((formalPreviewSection.match(/createSource: createLocalFilePreview/g) ?? [])).toHaveLength(2);
    expect(formalPreviewSection).not.toContain('convertFileSrc');
    expect(formalPreviewSection).toContain("'blob local-file preview'");
    expect(formalPreviewSection).toContain("'blob local-file watermark overlay'");
  });

  it('enables importing after the desktop bridge initializes', async () => {
    desktopHarness.available = true;
    desktopHarness.api = createDesktopApi();
    desktopHarness.load.mockResolvedValue(desktopHarness.api);
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="导入图片素材"]')?.disabled).toBe(false);
    expect(container.textContent).not.toContain('桌面环境初始化中');
    await act(async () => { root.unmount(); });
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

  it('reports unavailable desktop bridge instead of waiting forever', async () => {
    desktopHarness.available = false;
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('真实水印处理仅在桌面应用中可用');
    expect(container.textContent).not.toContain('桌面环境初始化中');
    await act(async () => { root.unmount(); });
  });

  it('reports a bridge loading failure instead of waiting forever', async () => {
    desktopHarness.available = true;
    desktopHarness.load.mockRejectedValueOnce(new Error('bridge unavailable'));
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('桌面环境初始化失败：bridge unavailable');
    expect(container.textContent).toContain('桌面环境初始化失败，请返回工具箱后重试');
    await act(async () => { root.unmount(); });
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

  it('keeps task start disabled until the listener is ready', async () => {
    let resolveListener: ((unlisten: () => void) => void) | undefined;
    const api = createDesktopApi({
      listenTaskEvents: vi.fn(() => new Promise<() => void>((resolve) => { resolveListener = resolve; })),
    });
    desktopHarness.available = true;
    desktopHarness.api = api;
    desktopHarness.load.mockResolvedValue(api);
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="开始添加水印到所有素材"]')?.disabled).toBe(true);
    await act(async () => { resolveListener?.(vi.fn()); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="导入图片素材"]')?.disabled).toBe(false);
    await act(async () => { root.unmount(); });
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

  it('shows listener initialization failure and leaves task start unavailable', async () => {
    const api = createDesktopApi({ listenTaskEvents: vi.fn().mockRejectedValue(new Error('listen failed')) });
    desktopHarness.available = true;
    desktopHarness.api = api;
    desktopHarness.load.mockResolvedValue(api);
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('桌面环境初始化失败：listen failed');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="开始添加水印到所有素材"]')?.disabled).toBe(true);
    await act(async () => { root.unmount(); });
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

  it('unsubscribes the initialized task listener exactly once on unmount', async () => {
    const unlisten = vi.fn();
    const api = createDesktopApi({ listenTaskEvents: vi.fn().mockResolvedValue(unlisten) });
    desktopHarness.available = true;
    desktopHarness.api = api;
    desktopHarness.load.mockResolvedValue(api);
    const { root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { root.unmount(); });
    expect(unlisten).toHaveBeenCalledTimes(1);
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

  it('receives a completed event emitted immediately after an accepted start', async () => {
    let listener: ((event: { kind: 'completed'; taskId: string; outputPath: string; outputBytes: number }) => void) | undefined;
    const api = createDesktopApi({
      listenTaskEvents: vi.fn(async (handler) => { listener = handler; return vi.fn(); }),
      startWatermarkTask: vi.fn(async (request) => {
        listener?.({ kind: 'completed', taskId: request.taskId, outputPath: '/tmp/output.png', outputBytes: 123 });
        return { taskId: request.taskId, outputPath: '/tmp/output.png' };
      }),
    });
    dialogHarness.open.mockResolvedValueOnce(['/tmp/input.png']).mockResolvedValueOnce('/tmp');
    desktopHarness.available = true;
    desktopHarness.api = api;
    desktopHarness.load.mockResolvedValue(api);
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    await act(async () => { buttons.find((button) => button.getAttribute('aria-label') === '导入图片素材')?.click(); await Promise.resolve(); });
    await act(async () => { buttons.find((button) => button.textContent?.includes('选择文件夹'))?.click(); await Promise.resolve(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="开始添加水印到所有素材"]')?.click(); await Promise.resolve(); });
    expect(api.startWatermarkTask).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('1 KB');
    expect(container.textContent).not.toContain('取消处理');
    await act(async () => { root.unmount(); });
    dialogHarness.open.mockReset();
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

});
