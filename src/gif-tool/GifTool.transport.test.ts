// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaProbeResult } from './types';

/**
 * 原片/截取条行为：播放只驱动播放头，移动播放头、播放、暂停都不会让已计算
 * 结果过期；只有素材、截取范围、倾向/帧率/尺寸才递增内容版本。
 */

const tauri = vi.hoisted(() => ({ failConvertFileSrc: false }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async () => undefined,
  convertFileSrc: (path: string) => {
    if (tauri.failConvertFileSrc) throw new Error('no tauri runtime');
    return `asset://localhost${path}`;
  },
}));

function deferred<T>() {
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
  discarded: [] as string[],
  cancelled: [] as string[],
  probed: [] as string[],
  probe: undefined as ((path: string) => Promise<MediaProbeResult>) | undefined,
  compute: undefined as ((request: any) => Promise<any>) | undefined,
  droppedListener: undefined as ((paths: string[]) => void) | undefined,
  taskListener: undefined as ((event: any) => void) | undefined,
};

vi.mock('../gif-media/mediaDesktop', () => ({
  isMediaDesktopAvailable: () => true,
  loadMediaDesktopApi: async () => ({
    getEngineStatus: async () => ({ ready: true, message: '内置引擎就绪' }),
    listenTaskEvents: async (listener: (event: any) => void) => {
      harness.taskListener = listener;
      return () => undefined;
    },
    listenDroppedPaths: async (listener: (paths: string[]) => void) => {
      harness.droppedListener = listener;
      return () => undefined;
    },
    pickMediaFiles: async () => [],
    probeMedia: (path: string) => {
      harness.probed.push(path);
      return harness.probe!(path);
    },
    pickOutputDirectory: async () => '/tmp/out',
    computeGifPreview: (request: any) => {
      harness.computeCalls.push(request);
      return harness.compute!(request);
    },
    saveComputedGif: async () => ({ path: '/tmp/out/a.gif', bytes: 10 }),
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

function probeResult(path = VIDEO_PATH, duration = 10): MediaProbeResult {
  return {
    path,
    width: 1280,
    height: 720,
    duration,
    fps: 30,
    codec: 'h264',
    sizeBytes: 1_000_000,
  } as MediaProbeResult;
}

function gifResult(taskId: string) {
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

function input(root: HTMLElement, label: string): HTMLInputElement {
  const element = root.querySelector(`input[aria-label="${label}"]`);
  if (!element) throw new Error(`input not found: ${label}`);
  return element as HTMLInputElement;
}

function timeline(root: HTMLElement): HTMLElement {
  const element = root.querySelector('.gif-timeline');
  if (!element) throw new Error('timeline not found');
  return element as HTMLElement;
}

function arrow(root: HTMLElement, key: 'ArrowLeft' | 'ArrowRight', modifier: 'none' | 'shift' | 'meta') {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: modifier === 'shift',
    metaKey: modifier === 'meta',
  });
  timeline(root).dispatchEvent(event);
}

/** jsdom does not implement media playback; expose a controllable currentTime. */
function installVideoStubs(): { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; setTime: (seconds: number) => void } {
  const video = document.querySelector('.gif-transport-video') as HTMLVideoElement;
  let time = 0;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value;
    },
  });
  const play = vi.fn(async () => undefined);
  const pause = vi.fn();
  video.play = play as unknown as HTMLMediaElement['play'];
  video.pause = pause as unknown as HTMLMediaElement['pause'];
  return { play, pause, setTime: (seconds: number) => { time = seconds; } };
}

async function mountTool() {
  harness.computeCalls = [];
  harness.discarded = [];
  harness.cancelled = [];
  harness.probed = [];
  harness.compute = undefined;
  harness.probe = async (path: string) => probeResult(path);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(GifTool);
  app.mount(root);
  await flush();
  return { app, root };
}

async function dropVideo(root: HTMLElement, path = VIDEO_PATH) {
  harness.droppedListener?.([path]);
  await flush();
  return root;
}

async function computeAndFinish(root: HTMLElement) {
  const held = deferred<any>();
  harness.compute = () => held.promise;
  queryButton(root, '.gif-transport-compute').click();
  await flush();
  const taskId: string = harness.computeCalls[0].taskId;
  held.resolve(gifResult(taskId));
  await flush();
  return taskId;
}

describe('GifTool transport (original video + trim timeline)', () => {
  let mounted: { app: ReturnType<typeof createApp>; root: HTMLElement } | undefined;

  beforeEach(() => {
    tauri.failConvertFileSrc = false;
    // jsdom 不实现媒体播放；默认给一个空实现，测试需要时再覆盖实例方法。
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined) as unknown as HTMLMediaElement['play'];
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    mounted?.app.unmount();
    document.body.innerHTML = '';
    mounted = undefined;
  });

  it('loads the original video through the desktop API and shows the segment duration', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);

    expect(harness.probed).toEqual([VIDEO_PATH]);
    expect(root.textContent).toContain('原片 · 00:10');
    expect(root.textContent).toContain('选中 00:10');
    expect(input(root, '截取开始秒数').value).toBe('0.0');
    expect(input(root, '截取结束秒数').value).toBe('10.0');
    expect(timeline(root).getAttribute('aria-valuemax')).toBe('10');
  });

  it('moves the playhead with the keyboard without touching the trim range', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);

    arrow(root, 'ArrowRight', 'none');
    await flush();
    expect(timeline(root).getAttribute('aria-valuenow')).toBe('0.1');
    expect(input(root, '截取开始秒数').value).toBe('0.0');

    arrow(root, 'ArrowLeft', 'none');
    await flush();
    expect(timeline(root).getAttribute('aria-valuenow')).toBe('0');
  });

  it('adjusts the trim start and end through the keyboard with a minimum segment length', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);

    arrow(root, 'ArrowRight', 'shift');
    arrow(root, 'ArrowRight', 'shift');
    await flush();
    expect(input(root, '截取开始秒数').value).toBe('1.0');
    expect(timeline(root).getAttribute('aria-valuenow')).toBe('1');

    arrow(root, 'ArrowLeft', 'meta');
    arrow(root, 'ArrowLeft', 'meta');
    await flush();
    expect(input(root, '截取结束秒数').value).toBe('9.0');

    // 起点不能越过终点：连续右移只会在终点前停住。
    for (let i = 0; i < 40; i += 1) arrow(root, 'ArrowRight', 'shift');
    await flush();
    const start = Number(input(root, '截取开始秒数').value);
    const end = Number(input(root, '截取结束秒数').value);
    expect(start).toBeLessThan(end);
    expect(Math.round((end - start) * 10) / 10).toBeGreaterThanOrEqual(0.1);
  });

  it('plays the original clip and pauses at the segment end', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const stubs = installVideoStubs();

    renderButton(root, '播放').click();
    await flush();
    expect(stubs.play).toHaveBeenCalledTimes(1);

    const video = document.querySelector('.gif-transport-video') as HTMLVideoElement;
    video.dispatchEvent(new Event('play'));
    await flush();
    expect(renderButton(root, '暂停')).toBeTruthy();

    stubs.setTime(10);
    video.dispatchEvent(new Event('timeupdate'));
    await flush();
    expect(stubs.pause).toHaveBeenCalled();
    expect(renderButton(root, '播放')).toBeTruthy();

    // 播放到片段末尾后再次播放：从选区起点重新开始。
    video.dispatchEvent(new Event('pause'));
    stubs.setTime(10);
    renderButton(root, '播放').click();
    await flush();
    expect((video as any).currentTime).toBe(0);
  });

  it('starts playback from the trim start when the playhead is outside the segment', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const stubs = installVideoStubs();

    arrow(root, 'ArrowRight', 'shift');
    arrow(root, 'ArrowRight', 'shift');
    await flush();
    expect(input(root, '截取开始秒数').value).toBe('1.0');

    stubs.setTime(0);
    renderButton(root, '播放').click();
    await flush();
    expect(stubs.play).toHaveBeenCalledTimes(1);
    const video = document.querySelector('.gif-transport-video') as HTMLVideoElement;
    expect((video as any).currentTime).toBe(1);
  });

  it('does not invalidate a computed result when playing, pausing or seeking', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    await computeAndFinish(root);
    const stubs = installVideoStubs();
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(false);

    renderButton(root, '播放').click();
    await flush();
    const video = document.querySelector('.gif-transport-video') as HTMLVideoElement;
    video.dispatchEvent(new Event('play'));
    stubs.setTime(4);
    video.dispatchEvent(new Event('timeupdate'));
    await flush();
    arrow(root, 'ArrowRight', 'none');
    await flush();
    video.dispatchEvent(new Event('pause'));
    await flush();

    expect(queryButton(root, '.gif-settings-save').disabled).toBe(false);
    expect(root.textContent).not.toContain('结果已过期');
  });

  it('invalidates a computed result when the trim range changes', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    await computeAndFinish(root);
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(false);

    const end = input(root, '截取结束秒数');
    end.value = '6.0';
    end.dispatchEvent(new Event('change'));
    await flush();

    expect(input(root, '截取结束秒数').value).toBe('6.0');
    expect(root.textContent).toContain('结果已过期');
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(true);
  });

  it('invalidates a computed result when the mode or frame rate changes', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    await computeAndFinish(root);

    renderButton(root, '均衡').click();
    await flush();
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(false);

    renderButton(root, '8 fps').click();
    await flush();
    expect(root.textContent).toContain('结果已过期');
    expect(queryButton(root, '.gif-settings-save').disabled).toBe(true);
  });

  it('replaces the material and discards the previous computed result', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const taskId = await computeAndFinish(root);
    expect(root.querySelector('.gif-preview-image')).not.toBeNull();

    await dropVideo(root, '/tmp/第二个 视频.mov');

    expect(harness.probed).toEqual([VIDEO_PATH, '/tmp/第二个 视频.mov']);
    expect(harness.discarded).toContain(taskId);
    expect(root.querySelector('.gif-preview-image')).toBeNull();
    expect(input(root, '截取结束秒数').value).toBe('10.0');
  });

  it('confirms before replacing the material while a compute is running', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);
    const held = deferred<any>();
    harness.compute = () => held.promise;
    queryButton(root, '.gif-transport-compute').click();
    await flush();
    const taskId: string = harness.computeCalls[0].taskId;

    harness.droppedListener?.(['/tmp/第二个 视频.mov']);
    await flush();
    expect(root.querySelector('.gif-tool-confirm-dialog')).not.toBeNull();
    expect(root.textContent).toContain('取消计算并更换');
    // Not replaced until the user confirms.
    expect(harness.probed).toEqual([VIDEO_PATH]);

    renderButton(root, '取消计算并更换').click();
    await flush();
    expect(harness.cancelled).toEqual([taskId]);
    expect(harness.probed).toContain('/tmp/第二个 视频.mov');

    // The cancelled job finishes late; the result must never appear.
    held.resolve(gifResult(taskId));
    await flush();
    expect(harness.discarded).toContain(taskId);
    expect(root.querySelector('.gif-preview-image')).toBeNull();
  });

  it('switches to the custom preset and exposes the width fields', async () => {
    mounted = await mountTool();
    const { root } = mounted;
    await dropVideo(root);

    expect(root.querySelector('input[aria-label="输出宽度"]')).toBeNull();
    renderButton(root, '自定义').click();
    await flush();

    expect(input(root, '输出宽度').value).toBe('1280');
    expect(input(root, '自定义帧率').value).toBe('12');

    const width = input(root, '输出宽度');
    width.value = '900';
    width.dispatchEvent(new Event('change'));
    await flush();

    const held = deferred<any>();
    harness.compute = () => held.promise;
    queryButton(root, '.gif-transport-compute').click();
    await flush();
    expect(harness.computeCalls[0].options.width).toBe(900);
    held.resolve(gifResult(harness.computeCalls[0].taskId));
    await flush();
  });
});
