// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaProbeResult } from './types';

/**
 * 「计算 GIF」→「保存 GIF」真实流程的行为测试。
 *
 * 组件挂载时通过动态 import 取得桌面 API，所以这里 mock 的是桌面桥接模块；
 * 断言集中在两件事：计算阶段不要求导出目录、不产生 PNG 参考帧；保存阶段
 * 复用同一份已计算结果，不重新编码、不覆盖旧文件、失败/取消不会污染状态。
 */

const tauri = vi.hoisted(() => ({ failConvertFileSrc: false }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async () => undefined,
  convertFileSrc: (path: string) => {
    if (tauri.failConvertFileSrc) throw new Error('no tauri runtime');
    return `asset://localhost${path}`;
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const harness = {
  computeCalls: [] as any[],
  saveCalls: [] as any[],
  discarded: [] as string[],
  cancelled: [] as string[],
  pickDirectoryCalls: 0,
  compute: undefined as ((request: any) => Promise<any>) | undefined,
  save: undefined as ((request: any) => Promise<any>) | undefined,
  pickDirectory: undefined as (() => Promise<string | null>) | undefined,
  probe: undefined as ((path: string) => Promise<MediaProbeResult>) | undefined,
  taskListener: undefined as ((event: any) => void) | undefined,
  droppedListener: undefined as ((paths: string[]) => void) | undefined,
  engineStatusCalls: 0,
  stopTaskEvents: vi.fn(),
  listenTasksGate: undefined as Promise<void> | undefined,
};

vi.mock('../gif-media/mediaDesktop', () => ({
  isMediaDesktopAvailable: () => true,
  loadMediaDesktopApi: async () => ({
    getEngineStatus: async () => {
      harness.engineStatusCalls += 1;
      return { ready: true, message: '内置引擎就绪' };
    },
    listenTaskEvents: async (listener: (event: any) => void) => {
      harness.taskListener = listener;
      if (harness.listenTasksGate) await harness.listenTasksGate;
      return harness.stopTaskEvents;
    },
    listenDroppedPaths: async (listener: (paths: string[]) => void) => {
      harness.droppedListener = listener;
      return () => undefined;
    },
    pickMediaFiles: async () => [],
    probeMedia: (path: string) => harness.probe!(path),
    pickOutputDirectory: () => {
      harness.pickDirectoryCalls += 1;
      return harness.pickDirectory!();
    },
    computeGifPreview: (request: any) => {
      harness.computeCalls.push(request);
      return harness.compute!(request);
    },
    saveComputedGif: (request: any) => {
      harness.saveCalls.push(request);
      return harness.save!(request);
    },
    discardComputedGif: async (taskId: string) => {
      harness.discarded.push(taskId);
    },
    cancelTask: async (taskId: string) => {
      harness.cancelled.push(taskId);
    },
    revealOutputFile: async () => undefined,
  }),
}));

import GifTool from './GifTool.vue';

const VIDEO_PATH = '/tmp/素材 01.mp4';

function probeResult(): MediaProbeResult {
  return {
    path: VIDEO_PATH,
    width: 1280,
    height: 720,
    duration: 10,
    fps: 30,
    codec: 'h264',
    sizeBytes: 1_000_000,
  } as MediaProbeResult;
}

function gifResult(taskId: string, overrides: Record<string, unknown> = {}) {
  return {
    taskId,
    path: `/tmp/brand-material-gif-preview/${taskId}.gif`,
    bytes: 1_500_000,
    width: 640,
    height: 360,
    fps: 15,
    durationSeconds: 10,
    startSeconds: 0,
    endSeconds: 10,
    ...overrides,
  };
}

async function flush() {
  for (let i = 0; i < 12; i += 1) await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 4; i += 1) await nextTick();
}

function renderButton(root: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll('button')).find(
    (candidate) => (candidate.textContent ?? '').trim() === text
  );
  if (!button) throw new Error(`button not found: ${text}`);
  return button as HTMLButtonElement;
}

function queryButton(root: HTMLElement, selector: string): HTMLButtonElement {
  const button = root.querySelector(selector);
  if (!button) throw new Error(`button not found: ${selector}`);
  return button as HTMLButtonElement;
}

async function mountTool(options: { listenTasksGate?: Promise<void> } = {}) {
  harness.computeCalls = [];
  harness.saveCalls = [];
  harness.discarded = [];
  harness.cancelled = [];
  harness.pickDirectoryCalls = 0;
  harness.compute = undefined;
  harness.save = undefined;
  harness.pickDirectory = async () => '/tmp/导出 目录';
  harness.probe = async () => probeResult();
  harness.engineStatusCalls = 0;
  harness.taskListener = undefined;
  harness.droppedListener = undefined;
  harness.stopTaskEvents = vi.fn();
  harness.listenTasksGate = options.listenTasksGate;
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(GifTool);
  app.mount(root);
  await flush();
  return { app, root };
}

/** Load a video through the desktop "files dropped" listener. */
async function dropVideo(root: HTMLElement, path = VIDEO_PATH) {
  harness.droppedListener?.([path]);
  await flush();
  return root;
}

/** Keep an in-flight compute controllable, then click 计算 GIF. */
async function startCompute(root: HTMLElement) {
  const held = deferred<any>();
  harness.compute = () => held.promise;
  queryButton(root, '.gif-transport-compute').click();
  await flush();
  return held;
}

function finishCompute(held: Deferred<any>, taskId: string, overrides: Record<string, unknown> = {}) {
  held.resolve(gifResult(taskId, overrides));
}

describe('GifTool compute and save flow', () => {
  let mounted: { app: ReturnType<typeof createApp>; root: HTMLElement } | undefined;

  beforeEach(() => {
    tauri.failConvertFileSrc = false;
    // jsdom 不实现媒体播放；避免替换素材时向 stderr 打印未实现错误。
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined) as unknown as HTMLMediaElement['play'];
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    mounted?.app.unmount();
    document.body.innerHTML = '';
    mounted = undefined;
  });

  it('computes without asking for an export directory and binds the result to the preview', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);

    expect(harness.pickDirectoryCalls).toBe(0);
    expect(harness.computeCalls.length).toBe(1);
    const request = harness.computeCalls[0];
    expect(request.inputPath).toBe(VIDEO_PATH);
    expect(request.options.targetBytes).toBe(7_800_000);
    expect(request.options.fps).toBe(10);
    expect(request.options.width).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain('outputDirectory');
    expect(JSON.stringify(request)).not.toContain('tempDir');

    // Computing state: one primary preview slot says it is working.
    expect(root.textContent).toContain('正在计算 GIF');

    const taskId: string = request.taskId;
    finishCompute(held, taskId);
    await flush();

    const image = root.querySelector('.gif-preview-image') as HTMLImageElement | null;
    expect(image, 'the GIF preview must be a single real image').not.toBeNull();
    expect(image!.getAttribute('src')).toBe(`asset://localhost${gifResult(taskId).path}`);
    expect(root.querySelectorAll('.gif-preview-image').length).toBe(1);
    expect(root.textContent).not.toContain('正在计算 GIF');

    // Actual size/bytes come from the computed result, not from the request.
    expect(root.textContent).toContain('实际体积：1.5 MB');
    expect(root.textContent).toContain('640×360');
  });

  it('corrects the preview viewport with the real loaded image size', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    const taskId: string = harness.computeCalls[0].taskId;
    finishCompute(held, taskId, { width: 0, height: 0 });
    await flush();

    const image = root.querySelector('.gif-preview-image') as HTMLImageElement;
    expect(image).not.toBeNull();
    Object.defineProperty(image, 'naturalWidth', { value: 512, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 288, configurable: true });
    image.dispatchEvent(new Event('load'));
    await flush();

    expect(root.textContent).toContain('512×288');
  });

  it('saves the computed file without re-encoding and reuses the chosen directory', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    const taskId: string = harness.computeCalls[0].taskId;
    finishCompute(held, taskId);
    await flush();

    harness.save = async () => ({ path: '/tmp/导出 目录/素材 01_gif.gif', bytes: 1_500_000 });
    queryButton(root, '.gif-settings-save').click();
    await flush();

    expect(harness.pickDirectoryCalls).toBe(1);
    expect(harness.saveCalls[0]).toEqual({ taskId, directory: '/tmp/导出 目录' });
    expect(root.textContent).toContain('已保存');
    // Saving must not start another compute/encode.
    expect(harness.computeCalls.length).toBe(1);

    queryButton(root, '.gif-settings-save').click();
    await flush();
    expect(harness.pickDirectoryCalls).toBe(1);
    expect(harness.saveCalls.length).toBe(2);
  });

  it('does not cache a cancelled directory pick and does not save on it', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    finishCompute(held, harness.computeCalls[0].taskId);
    await flush();

    harness.pickDirectory = async () => null;
    harness.save = async () => ({ path: '/tmp/导出 目录/a.gif', bytes: 10 });
    queryButton(root, '.gif-settings-save').click();
    await flush();
    expect(harness.saveCalls.length).toBe(0);
    expect(root.textContent).not.toContain('已保存');

    harness.pickDirectory = async () => '/tmp/再次选择';
    queryButton(root, '.gif-settings-save').click();
    await flush();
    expect(harness.pickDirectoryCalls).toBe(2);
    expect(harness.saveCalls[0].directory).toBe('/tmp/再次选择');
  });

  it('keeps the result saveable when only the preview fails to load', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    // Break the asset URL conversion for this compute only.
    tauri.failConvertFileSrc = true;
    const held = await startCompute(root);
    finishCompute(held, harness.computeCalls[0].taskId);
    await flush();

    expect(root.querySelector('.gif-preview-image')).toBeNull();
    expect(root.textContent).toContain('无法预览计算结果');
    const saveButton = queryButton(root, '.gif-settings-save');
    expect(saveButton.disabled).toBe(false);

    harness.save = async () => ({ path: '/tmp/导出 目录/素材 01_gif.gif', bytes: 1_500_000 });
    saveButton.click();
    await flush();
    expect(harness.saveCalls.length).toBe(1);
    expect(root.textContent).toContain('已保存');
  });

  it('marks a finished result stale when the trim or intent changes', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    finishCompute(held, harness.computeCalls[0].taskId);
    await flush();
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(false);

    renderButton(root, '画质优先').click();
    await flush();

    expect(root.textContent).toContain('结果已过期');
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(true);
    expect(queryButton(root, '.gif-transport-compute').textContent).toContain('重新计算');
  });

  it('cancels a running compute through the same button and reports the cancellation', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    const taskId: string = harness.computeCalls[0].taskId;

    const computeButton = queryButton(root, '.gif-transport-compute');
    expect(computeButton.textContent).toContain('取消计算');
    computeButton.click();
    await flush();
    expect(harness.cancelled).toEqual([taskId]);

    held.reject(new Error('计算已取消'));
    await flush();
    expect(root.textContent).toContain('已取消计算');
    expect(root.textContent).not.toContain('计算失败');
    expect(harness.computeCalls.length).toBe(1);
  });

  it('reports a failed compute and offers a retry without creating a result', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);

    held.reject(new Error('编码失败：无法满足体积上限'));
    await flush();

    expect(root.textContent).toContain('计算失败');
    expect(root.textContent).toContain('无法满足体积上限');
    expect(root.querySelector('.gif-preview-image')).toBeNull();
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(true);
    expect(queryButton(root, '.gif-transport-compute').textContent).toContain('重试计算');
  });

  it('drops a late result that belongs to old parameters and cleans up its file', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    const taskId: string = harness.computeCalls[0].taskId;

    // Change parameters while the encode is still running.
    renderButton(root, '帧率优先').click();
    await flush();
    expect(harness.cancelled).toEqual([taskId]);

    // The backend still finishes late: it must be discarded, never shown.
    finishCompute(held, taskId);
    await flush();

    expect(harness.discarded).toContain(taskId);
    expect(root.querySelector('.gif-preview-image')).toBeNull();
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(true);
    expect(root.textContent).toContain('参数已变化');
  });

  it('does not start a second compute while one is in flight', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    const computeButton = queryButton(root, '.gif-transport-compute');
    computeButton.click();
    await flush();
    expect(harness.computeCalls.length).toBe(1);
    held.reject(new Error('计算已取消'));
    await flush();
  });

  it('asks the Vue tool to confirm before the page header leaves the tool', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    const confirmed = vi.fn();
    window.addEventListener('gif-tool-confirmed-return', confirmed);

    // Nothing imported yet: leaving is harmless, so it returns immediately.
    window.dispatchEvent(new CustomEvent('gif-tool-request-return'));
    await flush();
    expect(root.querySelector('.gif-tool-confirm-dialog')).toBeNull();
    expect(confirmed).toHaveBeenCalledTimes(1);
    confirmed.mockClear();

    await dropVideo(root);
    window.dispatchEvent(new CustomEvent('gif-tool-request-return'));
    await flush();
    expect(root.querySelector('.gif-tool-confirm-dialog')).not.toBeNull();
    expect(confirmed).not.toHaveBeenCalled();

    renderButton(root, '清空并返回').click();
    await flush();
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.gif-tool-confirm-dialog')).toBeNull();
    window.removeEventListener('gif-tool-confirmed-return', confirmed);
  });

  it('forwards progress events for the active compute only', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    const taskId: string = harness.computeCalls[0].taskId;

    harness.taskListener?.({ kind: 'progress', taskId, progress: 0.42 });
    await flush();
    const progress = root.querySelector('[role="progressbar"]');
    expect(progress).not.toBeNull();
    expect(progress!.getAttribute('aria-valuenow')).toBe('42');

    // A stale progress event from another task must not move this bar.
    harness.taskListener?.({ kind: 'progress', taskId: 'other-task', progress: 0.9 });
    await flush();
    expect(progress!.getAttribute('aria-valuenow')).toBe('42');

    finishCompute(held, taskId);
    await flush();
  });

  it('cancels the running encode when the tool unmounts', async () => {
    mounted = await mountTool();
    const { root, app } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    const taskId: string = harness.computeCalls[0].taskId;

    app.unmount();
    mounted = undefined;
    await flush();

    expect(harness.cancelled).toContain(taskId);
    // The abandoned promise settling later must not touch the unmounted page.
    held.reject(new Error('计算已取消'));
    await flush();
    expect(harness.computeCalls.length).toBe(1);
  });

  it('releases a listener that resolves after unmount and stops initialization', async () => {
    const gate = deferred<void>();
    mounted = await mountTool({ listenTasksGate: gate.promise });
    const { root, app } = mounted;
    // The mount is stuck awaiting the task-event registration.
    expect(harness.engineStatusCalls).toBe(0);

    app.unmount();
    mounted = undefined;
    await flush();

    // The listener arrives after unmount: it must be released immediately and
    // no further initialization (dropped paths / engine status) may run.
    gate.resolve();
    await flush();
    expect(harness.stopTaskEvents).toHaveBeenCalledTimes(1);
    expect(harness.engineStatusCalls).toBe(0);
    expect(harness.droppedListener).toBeUndefined();
    root.remove();
  });

  it('drops a successful result that arrives after the user cancelled', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = await startCompute(root);
    const taskId: string = harness.computeCalls[0].taskId;

    queryButton(root, '.gif-transport-compute').click();
    await flush();
    expect(harness.cancelled).toEqual([taskId]);

    // While the original promise is still in flight the tool stays in the
    // cancelling state instead of letting a second encode start.
    const computeButton = queryButton(root, '.gif-transport-compute');
    expect(computeButton.textContent).toContain('取消中');
    expect(computeButton.disabled).toBe(true);
    expect(root.textContent).toContain('正在取消计算');
    queryButton(root, '.gif-transport-compute').click();
    await flush();
    expect(harness.computeCalls.length).toBe(1);

    // Late success (e.g. the encode finished just as cancel was accepted).
    finishCompute(held, taskId);
    await flush();

    expect(harness.discarded).toContain(taskId);
    expect(root.querySelector('.gif-preview-image')).toBeNull();
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(true);
    expect(root.textContent).toContain('已取消计算');
    expect(root.textContent).not.toContain('正在取消计算');
  });

  it('does not paint a previous video\'s save result onto the new video', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root, '/tmp/A.mp4');
    const held = await startCompute(root);
    finishCompute(held, harness.computeCalls[0].taskId);
    await flush();

    const saved = deferred<{ path: string; bytes: number }>();
    harness.save = () => saved.promise;
    queryButton(root, '.gif-settings-save').click();
    await flush();
    expect(harness.saveCalls.length).toBe(1);

    // Switch to another video while A's save is still in flight.
    await dropVideo(root, '/tmp/B.mov');
    await flush();

    saved.resolve({ path: '/tmp/导出 目录/A_gif.gif', bytes: 100 });
    await flush();

    // A's file was written on disk, but B's page must stay clean.
    expect(root.textContent).not.toContain('已保存');
    expect(root.textContent).not.toContain('A_gif');
    expect(root.textContent).not.toContain('/tmp/导出 目录');
    expect(root.querySelector('.gif-preview-image')).toBeNull();
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(true);
  });
});
