// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const coreHarness = vi.hoisted(() => ({
  createMaterialAsset: vi.fn(),
  releaseMaterialAsset: vi.fn(),
  renderBoardToCanvas: vi.fn(),
  canvasToBlob: vi.fn(),
}));
vi.mock('../core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core')>()),
  ...coreHarness,
}));
const fileSystemHarness = vi.hoisted(() => ({ saveBlobToOutputTarget: vi.fn() }));
vi.mock('../platform/fileSystem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/fileSystem')>()),
  ...fileSystemHarness,
}));
const desktopHarness = vi.hoisted(() => ({ available: false, load: vi.fn(), api: undefined as any }));
vi.mock('../gif-media/mediaDesktop', () => ({
  isMediaDesktopAvailable: () => desktopHarness.available,
  loadMediaDesktopApi: () => desktopHarness.load(),
}));

import { act } from 'react';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorkbenchWatermarkConfig, isStaticCanvasImage, watermarkOutputName, WatermarkWorkbench } from './WatermarkWorkbench';

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
      pickWatermarkFiles: vi.fn().mockResolvedValue([]),
      pickOutputDirectory: vi.fn().mockResolvedValue(null),
      pickWatermarkImage: vi.fn().mockResolvedValue(null),
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

  function resetLocalCanvasHarness() {
    const asset = { id: 'asset', fileName: 'input.png', objectUrl: 'blob:input', width: 100, height: 50, fileSize: 10, mimeType: 'image/png' };
    coreHarness.createMaterialAsset.mockReset().mockResolvedValue(asset);
    coreHarness.releaseMaterialAsset.mockReset();
    coreHarness.renderBoardToCanvas.mockReset().mockResolvedValue(document.createElement('canvas'));
    coreHarness.canvasToBlob.mockReset().mockResolvedValue(new Blob(['ok'], { type: 'image/png' }));
    fileSystemHarness.saveBlobToOutputTarget.mockReset().mockResolvedValue('/tmp/output.png');
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
    expect(markup).toContain('class="wm-canvas-wrap"');
    expect(markup).not.toContain('wm-fabric-host');
    expect(markup).not.toContain('<canvas');
  });

  it('routes both formal image preview chains through the unified MaterialAsset creator without Fabric', () => {
    const source = readFileSync(`${process.cwd()}/src/watermark-workbench/WatermarkWorkbench.tsx`, 'utf8');
    expect(source).toContain("createMaterialAsset({ kind: 'path', path: currentFile })");
    expect(source).toContain("createMaterialAsset({ kind: 'path', path: state.imagePath })");
    expect(source).not.toContain("from 'fabric'");
    expect(source).not.toContain('wm-fabric-host');
    expect(source).toContain("'material-asset preview'");
    expect(source).toContain("'material-asset watermark overlay'");
  });

  it('sends only still png/jpeg/webp images to the local Canvas branch', () => {
    expect(isStaticCanvasImage('/tmp/中文 空格.png')).toBe(true);
    expect(isStaticCanvasImage('/tmp/photo.JPEG')).toBe(true);
    expect(isStaticCanvasImage('/tmp/logo.webp')).toBe(true);
    expect(isStaticCanvasImage('/tmp/animated.gif')).toBe(false);
    expect(isStaticCanvasImage('/tmp/movie.mp4')).toBe(false);
    expect(isStaticCanvasImage('/tmp/movie.mov')).toBe(false);
  });

  it('writes webp local Canvas output as png without changing GIF naming', () => {
    expect(watermarkOutputName('/tmp/中文 空格.webp', 'png')).toBe('中文 空格_watermarked.png');
    expect(watermarkOutputName('/tmp/animated.gif', 'png')).toBe('animated_watermarked.png');
  });

  it('uses the same dark-watermark opacity rule for preview and local Canvas export config', () => {
    const config = createWorkbenchWatermarkConfig({ width: 100, height: 50 }, {
      kind: 'text', pattern: 'single', text: '暗水印', fontFamily: 'Arial', color: '#fff',
      scale: 1, rotation: 0, opacity: .5, x: 0, y: 0, density: 'medium', darkMode: true,
    });
    expect(config?.opacity).toBe(.06);
  });

  it.each(['/tmp/input.png', '/tmp/input.jpg', '/tmp/input.webp'])('renders static %s locally without starting an FFmpeg task', async (path) => {
    resetLocalCanvasHarness();
    const api = createDesktopApi();
    api.pickWatermarkFiles.mockResolvedValueOnce([path]);
    api.pickOutputDirectory.mockResolvedValueOnce('/tmp');
    desktopHarness.available = true;
    desktopHarness.load.mockResolvedValue(api);
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="导入图片素材"]')?.click(); await Promise.resolve(); });
    await act(async () => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('选择文件夹'))?.click(); await Promise.resolve(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="开始添加水印到所有素材"]')?.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(coreHarness.renderBoardToCanvas).toHaveBeenCalledOnce();
    expect(fileSystemHarness.saveBlobToOutputTarget).toHaveBeenCalledOnce();
    expect(api.startWatermarkTask).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

  it('releases the loaded static preview MaterialAsset on unmount', async () => {
    resetLocalCanvasHarness();
    const api = createDesktopApi();
    api.pickWatermarkFiles.mockResolvedValueOnce(['/tmp/input.png']);
    desktopHarness.available = true;
    desktopHarness.load.mockResolvedValue(api);
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="导入图片素材"]')?.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(coreHarness.createMaterialAsset).toHaveBeenCalledWith({ kind: 'path', path: '/tmp/input.png' });
    await act(async () => { root.unmount(); });
    expect(coreHarness.releaseMaterialAsset).toHaveBeenCalledTimes(1);
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

  it('releases the background when switching to GIF and releases a logo on kind change and unmount', async () => {
    const background = { id: 'background', fileName: 'input.png', objectUrl: 'blob:background', width: 100, height: 50, fileSize: 10, mimeType: 'image/png' };
    const logo = { id: 'logo', fileName: 'logo.png', objectUrl: 'blob:logo', width: 20, height: 10, fileSize: 10, mimeType: 'image/png' };
    coreHarness.createMaterialAsset.mockReset().mockResolvedValueOnce(background).mockResolvedValueOnce(logo);
    coreHarness.releaseMaterialAsset.mockReset();
    const api = createDesktopApi();
    api.pickWatermarkFiles.mockResolvedValueOnce(['/tmp/input.png', '/tmp/animated.gif']);
    api.pickWatermarkImage.mockResolvedValueOnce('/tmp/logo.png');
    desktopHarness.available = true;
    desktopHarness.load.mockResolvedValue(api);
    const { container, root } = await mountWorkbench();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="导入图片素材"]')?.click(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '图片 Logo')?.click(); await Promise.resolve(); });
    await act(async () => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '选择图片')?.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(coreHarness.createMaterialAsset).toHaveBeenCalledWith({ kind: 'path', path: '/tmp/logo.png' });

    await act(async () => { Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '文字')?.click(); await Promise.resolve(); });
    expect(coreHarness.releaseMaterialAsset).toHaveBeenCalledWith(logo);

    await act(async () => { container.querySelector<HTMLButtonElement>('.wm-file-remove')?.click(); await Promise.resolve(); });
    expect(coreHarness.releaseMaterialAsset).toHaveBeenCalledWith(background);
    await act(async () => { root.unmount(); });
    expect(coreHarness.releaseMaterialAsset).toHaveBeenCalledTimes(2);
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
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

  it.each(['/tmp/input.gif', '/tmp/input.mp4', '/tmp/input.mov'])('routes %s through the accepted FFmpeg task event path', async (inputPath) => {
    let listener: ((event: { kind: 'completed'; taskId: string; outputPath: string; outputBytes: number }) => void) | undefined;
    const api = createDesktopApi({
      listenTaskEvents: vi.fn(async (handler) => { listener = handler; return vi.fn(); }),
      startWatermarkTask: vi.fn(async (request) => {
        listener?.({ kind: 'completed', taskId: request.taskId, outputPath: '/tmp/output.png', outputBytes: 123 });
        return { taskId: request.taskId, outputPath: '/tmp/output.png' };
      }),
    });
    api.pickWatermarkFiles.mockResolvedValueOnce([inputPath]);
    api.pickOutputDirectory.mockResolvedValueOnce('/tmp');
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
    desktopHarness.available = false;
    desktopHarness.load.mockReset();
  });

});
