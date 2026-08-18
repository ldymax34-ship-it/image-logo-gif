// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaDesktopApi, VideoWatermarkRecommendation, WatermarkEncoderCapability, WatermarkPreviewRequest, WatermarkPreviewStatusEvent, WatermarkQueueStatusEvent } from '../gif-media/mediaDesktop';
import type { MediaProbeResult, MediaTaskEvent } from '../gif-media/mediaTypes';
import { VideoWatermarkWorkspace } from './VideoWatermarkWorkspace';
import { exportStatusStore } from '../components/export-status/exportStatusStore';
import { ExportStatusPanel } from '../components/export-status/ExportStatusPanel';

Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: () => undefined });
Object.defineProperty(Element.prototype, 'releasePointerCapture', { configurable: true, value: () => undefined });
Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, value: () => true });

function createApi(overrides: Partial<MediaDesktopApi> = {}) {
  let taskListener: ((event: MediaTaskEvent) => void) | undefined;
  let queueListener: ((event: WatermarkQueueStatusEvent) => void) | undefined;
  let previewListener: ((event: WatermarkPreviewStatusEvent) => void) | undefined;
  const stopTask = vi.fn();
  const stopQueue = vi.fn();
  const stopPreview = vi.fn();
  const pickVideoFiles = vi.fn(async () => ['/tmp/中文 空格/clip.mp4', '/tmp/skip.avi']);
  const pickOutputDirectory = vi.fn(async () => '/tmp/中文 空格/output');
  const probeMedia = vi.fn(async (_inputPath: string): Promise<MediaProbeResult> => ({ duration: 3.5, width: 640, height: 360, fps: 30, codec: 'h264', hasAudio: true }));
  const startWatermarkPreview = vi.fn(async (request: WatermarkPreviewRequest) => ({ taskId: request.taskId, outputPath: `/tmp/${request.taskId}.png` }));
  const cancelWatermarkPreview = vi.fn(async (_taskId: string) => undefined);
  const openOutputDirectory = vi.fn(async (_directory: string) => undefined);
  const revealOutputFile = vi.fn(async (_path: string) => undefined);
  const getVideoWatermarkRecommendation = vi.fn(async (request: { kind: 'text' | 'image'; text: string }): Promise<VideoWatermarkRecommendation> => ({
    sizePercent: request.kind === 'image' ? 8 : 5,
    density: 'high',
    columns: 4,
    rows: 3,
    spacingX: 140,
    spacingY: 100,
    opacity: 0.5,
    angle: 30,
    gutterPercent: 18,
    reason: '测试画面 · 4×3 网格 · 字号 5%',
  }));
  const startWatermarkTask = vi.fn<MediaDesktopApi['startWatermarkTask']>(async ({ taskId, options }) => ({
    taskId,
    outputPath: 'reservedOutputPath' in options && typeof options.reservedOutputPath === 'string'
      ? options.reservedOutputPath
      : `/tmp/${taskId}.mp4`,
  }));
  const capability: WatermarkEncoderCapability = { hardwareAvailable: false, backendName: 'CPU', reason: '当前随包 FFmpeg 未通过硬件编码探测' };
  const api: MediaDesktopApi = {
    getEngineStatus: async () => ({ ready: true, message: '', ffmpegVersion: 'test', ffprobeVersion: 'test' }),
    getWatermarkEncoderCapability: async () => capability,
    getVideoWatermarkRecommendation,
    pickMediaFiles: async () => [],
    pickVideoFiles,
    pickWatermarkFiles: async () => [],
    pickWatermarkImage: async () => null,
    pickTemplateFiles: async () => [],
    pickOutputDirectory,
    startGifTask: async (request) => ({ taskId: request.taskId, outputPath: '/tmp/gif.gif' }),
    startWatermarkTask,
    probeMedia,
    previewGifFrame: async (request) => ({ taskId: request.taskId, outputPath: '/tmp/frame.gif' }),
    cancelPreviewTask: async () => undefined,
    cancelTask: async () => undefined,
    listenTaskEvents: async (listener) => { taskListener = listener; return stopTask; },
    openOutputDirectory,
    revealOutputFile,
    startWatermarkPreview,
    cancelWatermarkPreview,
    listenWatermarkQueueEvents: async (listener) => { queueListener = listener; return stopQueue; },
    listenWatermarkPreviewEvents: async (listener) => { previewListener = listener; return stopPreview; },
    listenDroppedPaths: async () => () => undefined,
    ...overrides,
  };
  return {
    api, pickVideoFiles, pickOutputDirectory, probeMedia, startWatermarkPreview,
    cancelWatermarkPreview, startWatermarkTask, stopTask, stopQueue, stopPreview,
    openOutputDirectory, revealOutputFile, getVideoWatermarkRecommendation,
    getTaskListener: () => taskListener, getQueueListener: () => queueListener,
    getPreviewListener: () => previewListener,
  };
}

const fakePreviewLoader = vi.fn(async (path: string) => `blob:preview-${path}`);

function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });
  return { container, root };
}

async function flush(ms = 25) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function chooseFirstVideo(container: HTMLElement) {
  const choose = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择 MP4 / MOV'));
  act(() => { choose?.click(); });
  await flush();
}

async function chooseOutput(container: HTMLElement) {
  const output = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择输出文件夹'));
  act(() => { output?.click(); });
  await flush();
}

function pressKey(el: Element, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function chooseRadixOption(trigger: HTMLElement, optionText: string) {
  act(() => {
    trigger.focus();
    pressKey(trigger, 'Enter');
  });
  await flush();
  const option = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
    .find((item) => item.textContent?.trim() === optionText);
  act(() => { pressKey(option!, 'Enter'); });
  await flush();
}

async function activateTab(container: HTMLElement, label: string) {
  const tab = [...container.querySelectorAll<HTMLElement>('[role="tab"]')]
    .find((item) => item.textContent === label)!;
  act(() => {
    tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    tab.click();
  });
  await flush();
}

describe('VideoWatermarkWorkspace independent page', () => {
  beforeEach(() => {
    exportStatusStore.resetForTests();
  });

  it('mirrors the locally-controlled queue into the shared export center without taking over control', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    await flush();

    const queued = exportStatusStore.getSnapshot();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ source: 'video-watermark', status: 'queued', extension: 'mp4' });

    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'))!;
    act(() => { start.click(); });
    await flush();
    const taskId = harness.startWatermarkTask.mock.calls[0][0].taskId;
    act(() => { harness.getTaskListener()?.({ kind: 'completed', taskId, outputPath: '/tmp/final.mp4', outputBytes: 20 }); });
    await flush();

    const done = exportStatusStore.getSnapshot();
    expect(done[0]).toMatchObject({ status: 'completed', progress: 100 });
    expect(done[0].size).toBe('20 B');
    expect(done[0].outputPath).toBe('/tmp/final.mp4');

    act(() => root.unmount());
    container.remove();
  });

  it('shows the real output filename with its extension in the shared export task', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'))!;
    act(() => { start.click(); });
    await flush();
    const taskId = harness.startWatermarkTask.mock.calls[0][0].taskId;
    act(() => { harness.getTaskListener()?.({ kind: 'completed', taskId, outputPath: '/tmp/中文 空格/output/clip_watermarked.mp4', outputBytes: 20 }); });
    await flush();

    const shared = exportStatusStore.getSnapshot();
    expect(shared).toHaveLength(1);
    expect(shared[0].outputPath).toBe('/tmp/中文 空格/output/clip_watermarked.mp4');
    expect(shared[0].name).toBe('clip_watermarked');
    expect(shared[0].extension).toBe('mp4');

    // 共享导出中心任务项按 name.extension 渲染，应显示真实输出文件名而非源文件名。
    const panel = mount(<ExportStatusPanel />);
    expect(panel.container.textContent).toContain('clip_watermarked.mp4');
    expect(panel.container.textContent).not.toContain('clip.mp4');
    act(() => panel.root.unmount());
    panel.container.remove();

    act(() => root.unmount());
    container.remove();
  });

  it('renders an independent video page without image/video mode tabs', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    expect(container.querySelector('[aria-label="视频素材"]')).not.toBeNull();
    expect([...container.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent === '图片')).toBe(false);
    expect([...container.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent === '视频')).toBe(false);
    expect(container.querySelector('[aria-label="水印素材"]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('automatically requests a timestamp-zero preview after import without requiring an output directory', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    expect(harness.pickVideoFiles).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('clip.mp4');
    expect(container.textContent).toContain('640 × 360');
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    expect(harness.startWatermarkPreview.mock.calls[0][0].timestampSeconds).toBe(0);
    expect(harness.api.getVideoWatermarkRecommendation).toHaveBeenCalledTimes(1);
    expect(harness.startWatermarkPreview.mock.calls[0][0]).toMatchObject({ cleanFrame: true });
    expect(harness.startWatermarkPreview.mock.calls[0][0].columns).toBeUndefined();
    expect(harness.startWatermarkPreview.mock.calls[0][0].rows).toBeUndefined();
    expect(container.textContent).toContain('已应用推荐');
    const previewTaskId = harness.startWatermarkPreview.mock.calls[0][0].taskId;
    act(() => { harness.getPreviewListener()?.({ taskId: previewTaskId, status: 'completed', outputPath: `/tmp/${previewTaskId}.png` }); });
    await flush();
    expect(container.querySelector('canvas')).not.toBeNull();
    act(() => root.unmount());
    expect(harness.stopTask).toHaveBeenCalledTimes(1);
    expect(harness.stopQueue).toHaveBeenCalledTimes(1);
    expect(harness.stopPreview).toHaveBeenCalledTimes(1);
    expect(harness.cancelWatermarkPreview).toHaveBeenCalledWith(previewTaskId);
    container.remove();
  });

  it('applies the first recommendation once and does not overwrite custom settings', async () => {
    const harness = createApi({
      getVideoWatermarkRecommendation: async () => ({
        sizePercent: 3,
        density: 'medium',
        columns: 3,
        rows: 3,
        spacingX: 220,
        spacingY: 160,
        opacity: 0.56,
        angle: 30,
        gutterPercent: 18,
        reason: '横屏 画面复杂度 15.2 · 3×3 网格 · 字号 3%',
      }),
    });
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    expect(container.textContent).toContain('已应用推荐');
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    act(() => { setTextAreaValue(textarea, '手工修改'); });
    expect(container.textContent).toContain('已自定义');
    act(() => root.unmount());
    container.remove();
  });

  it('reapplies a recommendation without starting a second preview', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    const reapply = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('重新推荐'))!;
    act(() => { reapply.click(); });
    await flush();
    expect(harness.api.getVideoWatermarkRecommendation).toHaveBeenCalledTimes(2);
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('已应用推荐');
    act(() => root.unmount());
    container.remove();
  });

  it('reapplying a recommendation switches a single watermark back to brick without auto preview', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);

    const arrangement = container.querySelector<HTMLElement>('button[aria-label="视频排列方式"]')!;
    await chooseRadixOption(arrangement, '单个');
    expect(container.textContent).toContain('已自定义');
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);

    const reapply = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('重新推荐'))!;
    act(() => { reapply.click(); });
    await flush();
    expect(container.textContent).toContain('已应用推荐');
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button[aria-label="视频排列方式"]')?.textContent).toContain('砖型平铺');
    act(() => root.unmount());
    container.remove();
  });

  it('Add Queue only creates pending drafts; Start Queue submits them in order', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'));
    act(() => { add?.click(); });
    await flush();
    expect(harness.startWatermarkTask).not.toHaveBeenCalled();
    expect(container.textContent).toContain('等待提交');
    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'));
    act(() => { start?.click(); });
    await flush();
    expect(harness.startWatermarkTask).toHaveBeenCalledTimes(1);
    const request = harness.startWatermarkTask.mock.calls[0][0];
    expect(request.options).toMatchObject({ kind: 'text', pattern: 'tiled', density: 'high', quality: 'high', preferHardware: false, outputDirectory: '/tmp/中文 空格/output' });
    expect('columns' in request.options && request.options.columns).toBeUndefined();
    expect('rows' in request.options && request.options.rows).toBeUndefined();
    expect('placements' in request.options && request.options.placements).toBeTruthy();
    expect('placements' in request.options && request.options.placements?.length).toBeGreaterThan(1);
    const taskId = request.taskId;
    act(() => { harness.getQueueListener()?.({ taskId, status: 'processing' }); });
    act(() => { harness.getTaskListener()?.({ kind: 'progress', taskId, progress: 0.8 }); });
    act(() => { harness.getTaskListener()?.({ kind: 'completed', taskId, outputPath: '/tmp/final.mp4', outputBytes: 20 }); });
    expect(container.textContent).toContain('已完成');
    act(() => root.unmount());
    container.remove();
  });

  it('allows repeated drafts for the same source with independent frozen options', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    act(() => { add.click(); });
    await flush();
    expect(harness.startWatermarkTask).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.wm-video-task-row')).toHaveLength(2);
    const draftPaths = [...container.querySelectorAll<HTMLElement>('.wm-video-task-filename')].map((node) => node.getAttribute('title')?.trim() ?? '');
    expect(new Set(draftPaths).size).toBe(2);
    expect(draftPaths).toContain('/tmp/中文 空格/output/clip_watermarked.mp4');
    expect(draftPaths).toContain('/tmp/中文 空格/output/clip_watermarked_2.mp4');
    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'))!;
    act(() => { start.click(); });
    await flush();
    expect(harness.startWatermarkTask).toHaveBeenCalledTimes(2);
    const ids = harness.startWatermarkTask.mock.calls.map((call) => call[0].taskId);
    expect(new Set(ids).size).toBe(2);
    const reservedPaths = harness.startWatermarkTask.mock.calls.map((call) => {
      const options = call[0].options;
      return 'reservedOutputPath' in options ? options.reservedOutputPath : undefined;
    });
    expect(new Set(reservedPaths).size).toBe(2);
    act(() => root.unmount());
    container.remove();
  });

  it('starts existing drafts from their frozen output directory even after the current setting changes', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    await flush();

    harness.pickOutputDirectory.mockResolvedValueOnce('');
    const output = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择输出文件夹'));
    act(() => { output?.click(); });
    await flush();

    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'))!;
    act(() => { start.click(); });
    await flush();
    expect(harness.startWatermarkTask).toHaveBeenCalledTimes(1);
    expect(harness.startWatermarkTask.mock.calls[0][0].options.outputDirectory).toBe('/tmp/中文 空格/output');
    act(() => root.unmount());
    container.remove();
  });

  it('does not auto-run FFmpeg when watermark parameters change', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    const initialPreviewTaskId = harness.startWatermarkPreview.mock.calls[0][0].taskId;
    act(() => { harness.getPreviewListener()?.({ taskId: initialPreviewTaskId, status: 'completed', outputPath: `/tmp/${initialPreviewTaskId}.png` }); });
    await flush();
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    act(() => {
      setTextAreaValue(textarea, '新的水印文字');
      textarea.dispatchEvent(new Event('focusout', { bubbles: true }));
    });
    const sizeThumb = container.querySelector<HTMLElement>('[role="slider"][aria-label="大小"]')!;
    act(() => { pressKey(sizeThumb, 'ArrowRight'); });
    const opacityThumb = container.querySelector<HTMLElement>('[role="slider"][aria-label="透明度"]')!;
    act(() => { pressKey(opacityThumb, 'ArrowRight'); });
    await flush(350);
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('已自定义');
    act(() => root.unmount());
    container.remove();
  });

  it('parameter edits keep the current clean frame visible without starting another FFmpeg request', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    const initialTaskId = harness.startWatermarkPreview.mock.calls[0][0].taskId;
    act(() => { harness.getPreviewListener()?.({ taskId: initialTaskId, status: 'completed', outputPath: `/tmp/${initialTaskId}.png` }); });
    await flush();
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    act(() => {
      setTextAreaValue(textarea, '新的水印文字');
    });
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    expect(container.querySelector('canvas')).toBe(canvas);
    expect(container.querySelector('.wm-video-preview-loading')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('ignores stale preview completion after a newer preview request', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    const firstTaskId = harness.startWatermarkPreview.mock.calls[0][0].taskId;
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    act(() => {
      setTextAreaValue(textarea, '新的水印文字');
    });
    const thumb = container.querySelector<HTMLElement>('[role="slider"][aria-label="预览时间"]')!;
    act(() => {
      thumb.focus();
      pressKey(thumb, 'End');
      thumb.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true, cancelable: true }));
    });
    await flush();
    const secondTaskId = harness.startWatermarkPreview.mock.calls[1][0].taskId;
    act(() => { harness.getPreviewListener()?.({ taskId: firstTaskId, status: 'completed', outputPath: '/tmp/old.png' }); });
    await flush();
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(2);
    act(() => { harness.getPreviewListener()?.({ taskId: secondTaskId, status: 'completed', outputPath: '/tmp/new.png' }); });
    await flush();
    expect(container.querySelector('canvas')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('disables the GPU switch and explains CPU fallback when hardware is unavailable', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await flush();
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
    expect(container.textContent).toContain('当前系统不支持硬件编码');
    act(() => root.unmount());
    container.remove();
  });

  it('shows an accessible zero-based timeline after import', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    const thumb = container.querySelector<HTMLElement>('[role="slider"][aria-label="预览时间"]')!;
    expect(thumb.getAttribute('aria-valuenow')).toBe('0');
    expect(container.textContent).toContain('00:00.00');
    expect(container.textContent).toContain('00:03.50');
    act(() => root.unmount());
    container.remove();
  });

  it('requests a new timestamp only when the timeline commit is released and keeps the old image while loading', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    const initialTaskId = harness.startWatermarkPreview.mock.calls[0][0].taskId;
    act(() => { harness.getPreviewListener()?.({ taskId: initialTaskId, status: 'completed', outputPath: `/tmp/${initialTaskId}.png` }); });
    await flush();
    const canvas = container.querySelector('canvas');
    const thumb = container.querySelector<HTMLElement>('[role="slider"][aria-label="预览时间"]')!;
    act(() => {
      thumb.focus();
      pressKey(thumb, 'End');
      thumb.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true, cancelable: true }));
    });
    await flush();
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(2);
    expect(harness.startWatermarkPreview.mock.calls[1][0].timestampSeconds).toBeGreaterThan(0);
    expect(container.querySelector('canvas')).toBe(canvas);
    expect(container.querySelector('.wm-video-preview-loading')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('keeps watermark settings and one output picker in separate panels without a top-level tab pair', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await flush();
    expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).not.toContain('水印设置');
    expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).not.toContain('输出设置');
    expect(container.querySelector('[aria-label="水印设置"]')?.querySelector('textarea')).not.toBeNull();
    expect(container.querySelector('[aria-label="水印设置"]')?.textContent).not.toContain('输出到');
    const outputPickers = [...container.querySelectorAll('button')].filter((button) => button.textContent?.includes('选择输出文件夹'));
    expect(outputPickers).toHaveLength(1);
    expect(container.querySelector('[aria-label="输出与队列"]')?.contains(outputPickers[0])).toBe(true);
    act(() => root.unmount());
    container.remove();
  });

  it('renders one embedded export center that merges output config and queue controls', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await flush();

    expect(container.querySelectorAll('[aria-label="输出与队列"]')).toHaveLength(1);
    // 不再保留两个独立的纵向输出站点（输出配置 / 导出队列）。
    expect(container.querySelector('[aria-label="输出配置"]')).toBeNull();
    expect(container.querySelector('[aria-label="导出队列"]')).toBeNull();

    const center = container.querySelector<HTMLElement>('[aria-label="输出与队列"]')!;
    expect(center.textContent).toContain('输出到');
    expect(center.textContent).toContain('添加当前到队列');
    expect(center.textContent).toContain('启动队列');
    expect(center.textContent).toContain('全部添加');
    expect(center.textContent).toContain('清除已完成');
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the add-current primary action in the export center, not below the settings scroll region', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await flush();

    const settings = container.querySelector<HTMLElement>('[aria-label="水印设置"]')!;
    const center = container.querySelector<HTMLElement>('[aria-label="输出与队列"]')!;
    const addButtons = [...container.querySelectorAll('button')].filter((button) => button.textContent?.includes('添加当前到队列'));
    expect(addButtons).toHaveLength(1);
    expect(settings.textContent).not.toContain('添加当前到队列');
    expect(center.contains(addButtons[0])).toBe(true);
    act(() => root.unmount());
    container.remove();
  });

  it('copies the completed output path from the completed task action', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'))!;
    act(() => { start.click(); });
    await flush();
    const taskId = harness.startWatermarkTask.mock.calls[0][0].taskId;
    act(() => { harness.getTaskListener()?.({ kind: 'completed', taskId, outputPath: '/tmp/中文 空格/output/clip_watermarked.mp4', outputBytes: 20 }); });
    await flush();

    const copy = container.querySelector<HTMLButtonElement>('button[aria-label="复制 clip.mp4 输出路径"]')!;
    expect(copy).not.toBeNull();
    act(() => { copy.click(); });
    await flush();
    expect(writeText).toHaveBeenCalledWith('/tmp/中文 空格/output/clip_watermarked.mp4');
    act(() => root.unmount());
    container.remove();
  });

  it('opens the selected output directory only from the queue export panel', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await flush();
    const open = container.querySelector<HTMLButtonElement>('button[aria-label="打开输出目录"]')!;
    expect(open.disabled).toBe(true);
    await chooseOutput(container);
    expect(open.disabled).toBe(false);
    act(() => { open.click(); });
    await flush();
    expect(harness.openOutputDirectory).toHaveBeenCalledWith('/tmp/中文 空格/output');
    act(() => root.unmount());
    container.remove();
  });

  it('reveals a completed output file without using the current output setting', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'))!;
    act(() => { start.click(); });
    await flush();
    const taskId = harness.startWatermarkTask.mock.calls[0][0].taskId;
    act(() => { harness.getTaskListener()?.({ kind: 'completed', taskId, outputPath: '/tmp/中文 空格/output/clip_watermarked.mp4', outputBytes: 20 }); });
    const reveal = container.querySelector<HTMLButtonElement>('button[aria-label="在文件夹中显示 clip.mp4"]')!;
    act(() => { reveal.click(); });
    await flush();
    expect(harness.revealOutputFile).toHaveBeenCalledWith('/tmp/中文 空格/output/clip_watermarked.mp4');
    act(() => root.unmount());
    container.remove();
  });

  it('shows only the output filename in the row while keeping the full path in title and reveal/copy actions', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    await flush();

    const filename = container.querySelector<HTMLElement>('.wm-video-task-filename');
    expect(filename?.textContent).toBe('clip_watermarked.mp4');
    expect(filename?.getAttribute('title')).toBe('/tmp/中文 空格/output/clip_watermarked.mp4');
    expect(container.querySelector('.wm-output-path')).toBeNull();

    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'))!;
    act(() => { start.click(); });
    await flush();
    const taskId = harness.startWatermarkTask.mock.calls[0][0].taskId;
    act(() => { harness.getTaskListener()?.({ kind: 'completed', taskId, outputPath: '/tmp/中文 空格/output/clip_watermarked.mp4', outputBytes: 20 }); });
    await flush();

    const reveal = container.querySelector<HTMLButtonElement>('button[aria-label="在文件夹中显示 clip.mp4"]')!;
    expect(reveal.getAttribute('title')).toBe('/tmp/中文 空格/output/clip_watermarked.mp4');
    act(() => { reveal.click(); });
    await flush();
    expect(harness.revealOutputFile).toHaveBeenCalledWith('/tmp/中文 空格/output/clip_watermarked.mp4');
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the same canvas node while parameter edits redraw the watermark live', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    const firstTaskId = harness.startWatermarkPreview.mock.calls[0][0].taskId;
    act(() => { harness.getPreviewListener()?.({ taskId: firstTaskId, status: 'completed', outputPath: `/tmp/${firstTaskId}.png` }); });
    await flush();
    const before = container.querySelector('canvas');
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    act(() => {
      setTextAreaValue(textarea, '尚未刷新');
    });
    expect(container.querySelector('canvas')).toBe(before);
    expect(container.textContent).toContain('已自定义');
    act(() => root.unmount());
    container.remove();
  });

  it('freezes density and quality into each draft while leaving subsequent settings editable', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);

    const densityTrigger = container.querySelector<HTMLElement>('button[aria-label="视频平铺密度"]')!;
    await chooseRadixOption(densityTrigger, '密集');
    const qualityTrigger = container.querySelector<HTMLElement>('button[aria-label="视频质量预设"]')!;
    await chooseRadixOption(qualityTrigger, '较小文件');
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    await flush();

    await chooseRadixOption(densityTrigger, '稀疏');
    await chooseRadixOption(qualityTrigger, '平衡');
    act(() => { add.click(); });
    await flush();
    const drafts = harness.startWatermarkTask.mock.calls.map((call) => call[0].options);
    expect(drafts).toHaveLength(0);
    const draftRows = container.querySelectorAll('.wm-video-task-row');
    expect(draftRows).toHaveLength(2);
    expect(container.textContent).toContain('平衡');
    const start = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('启动队列'))!;
    act(() => { start.click(); });
    await flush();
    expect(harness.startWatermarkTask).toHaveBeenCalledTimes(2);
    expect(harness.startWatermarkTask.mock.calls[0][0].options).toMatchObject({ density: 'high', quality: 'compact' });
    expect(harness.startWatermarkTask.mock.calls[1][0].options).toMatchObject({ density: 'low', quality: 'balanced' });
    act(() => root.unmount());
    container.remove();
  });

  it('shows the frozen render parameters on each queue draft', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前'))!;
    act(() => { add.click(); });
    await flush();
    const summary = container.querySelector<HTMLElement>('.wm-video-task-summary');
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain('砖型');
    expect(summary?.textContent).toContain('密集');
    expect(summary?.textContent).toContain('°');
    expect(summary?.textContent).toContain('%');
    act(() => root.unmount());
    container.remove();
  });

  it('disables the desktop-only output open action in Web Lite', async () => {
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} previewObjectUrlLoader={fakePreviewLoader} />);
    await flush();
    const open = container.querySelector<HTMLButtonElement>('button[aria-label="打开输出目录"]')!;
    expect(open.disabled).toBe(true);
    expect(container.textContent).toContain('打开输出目录仅桌面端可用');
    act(() => root.unmount());
    container.remove();
  });

  it('shows a real frame thumbnail for a loaded video once its clean preview frame arrives', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    // Before the frame arrives, the fallback Film icon is preserved.
    expect(container.querySelector('.wm-video-asset-thumb')).toBeNull();
    expect(container.querySelector('.wm-video-file-icon')).not.toBeNull();

    const previewTaskId = harness.startWatermarkPreview.mock.calls[0][0].taskId;
    act(() => { harness.getPreviewListener()?.({ taskId: previewTaskId, status: 'completed', outputPath: `/tmp/${previewTaskId}.png` }); });
    await flush();

    const thumb = container.querySelector<HTMLImageElement>('.wm-video-asset-thumb');
    expect(thumb).not.toBeNull();
    expect(thumb?.getAttribute('src')).toBe(`blob:preview-/tmp/${previewTaskId}.png`);
    expect(container.querySelector('.wm-video-file-icon')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('keeps 启动队列 as a level-1 primary CTA in the export center header next to the count', async () => {
    const harness = createApi();
    const { container, root } = mount(<VideoWatermarkWorkspace onReturn={() => undefined} injectedApi={harness.api} previewObjectUrlLoader={fakePreviewLoader} />);
    await chooseFirstVideo(container);
    await chooseOutput(container);
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加当前到队列'))!;
    act(() => { add.click(); });
    await flush();

    const center = container.querySelector<HTMLElement>('[aria-label="输出与队列"]')!;
    const head = center.querySelector<HTMLElement>('.wm-export-center-head')!;
    const cta = head.querySelector<HTMLButtonElement>('button.wm-start-queue-cta')!;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('aria-label')).toBe('启动队列');
    expect(cta.textContent).toContain('启动队列');
    expect(cta.disabled).toBe(false);
    expect(head.querySelector('.wm-queue-count')?.textContent).toContain('1 项');

    act(() => { cta.click(); });
    await flush();
    expect(harness.startWatermarkTask).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });
});
