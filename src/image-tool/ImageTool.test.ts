// @vitest-environment jsdom
import { createApp, nextTick, type App } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncodedImage, EncodeInput } from './types';

/**
 * 图片压缩（单图）行为测试。
 *
 * 产品规则：
 *  - 只做单图压缩；导入后本地编码，参数变化去抖重编，旧结果不得覆盖新状态。
 *  - 编码在 worker 中完成（这里替换为可控假实现），失败只提示、不清空原图。
 *  - 保存走既有桌面保存能力，默认不覆盖原图；取消保存不写文件。
 */

type PendingEncode = {
  input: EncodeInput;
  resolve: (value: EncodedImage) => void;
  reject: (error: Error) => void;
};

const harness = vi.hoisted(() => ({
  pending: [] as PendingEncode[],
  encodeCalls: [] as EncodeInput[],
  disposed: 0,
  chooseTarget: (async () => ({ kind: 'desktop-directory', path: '/tmp/输出 目录', reservedFileNames: new Set<string>() })) as (
    ...args: any[]
  ) => Promise<any>,
  chooseCalls: 0,
  saved: [] as Array<{ target: any; fileName: string; blob: Blob }>,
  saveImpl: (async (_target: any, fileName: string) => fileName) as (
    ...args: any[]
  ) => Promise<string>,
  revealed: [] as string[],
}));

vi.mock('./encoder', () => ({
  createWorkerEncoder: () => ({
    encode(input: EncodeInput) {
      harness.encodeCalls.push(input);
      return new Promise<EncodedImage>((resolve, reject) => {
        harness.pending.push({ input, resolve, reject });
      });
    },
    dispose() {
      harness.disposed += 1;
    },
  }),
}));

vi.mock('../platform/fileSystem', () => ({
  chooseOutputTarget: (...args: any[]) => harness.chooseTarget(...args),
  saveBlobToOutputTarget: (target: any, fileName: string, blob: Blob) => {
    harness.saved.push({ target, fileName, blob });
    return harness.saveImpl(target, fileName, blob);
  },
  joinNativePath: (directory: string, fileName: string) => `${directory}/${fileName}`,
  isRevealableOutputPath: (path: string | undefined) =>
    typeof path === 'string' && (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)),
  revealPathInFolder: async (path: string) => {
    harness.revealed.push(path);
  },
}));

import ImageTool from './ImageTool.vue';

type Mounted = { app: App; container: HTMLDivElement };

let mounted: Mounted | undefined;
let bitmapSizes: Array<{ width: number; height: number }> = [];
let urlCounter = 0;
const closedBitmaps: Array<{ close: ReturnType<typeof vi.fn> }> = [];

function bitmap(width: number, height: number) {
  const close = vi.fn();
  const value = { width, height, close };
  closedBitmaps.push(value);
  return value;
}

async function settle(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mountTool(): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const app = createApp(ImageTool);
  app.mount(container);
  mounted = { app, container };
  return mounted;
}

function query(container: HTMLElement, selector: string): HTMLElement | null {
  return container.querySelector(selector);
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const found = buttons.find((button) => (button.textContent ?? '').includes(text));
  if (!found) throw new Error(`未找到按钮：${text}`);
  return found as HTMLButtonElement;
}

async function chooseFile(container: HTMLElement, file: File, index = 0) {
  const input = query(container, 'input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
  });
  input.dispatchEvent(new Event('change'));
  await settle();
  return index;
}

function pngFile(name = '海报 01.png', bytes = 200_000): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

const FORMAT_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  png: 'image/png',
};

function resolveEncode(index: number, size: number, width: number, height: number, format = 'jpeg') {
  const pending = harness.pending[index];
  if (!pending) throw new Error(`没有第 ${index} 个编码任务`);
  pending.resolve({
    bytes: new Uint8Array(size).map((_, i) => (size + i) % 251),
    width,
    height,
    mime: FORMAT_MIME[format] ?? 'image/jpeg',
  });
}

/** 让目录选择器挂起，等测试决定返回结果（用于覆盖「弹窗等待期间参数变化」）。 */
function pendDirectoryPicker() {
  let settlePicker: ((target: any) => void) | undefined;
  harness.chooseTarget = () => {
    harness.chooseCalls += 1;
    return new Promise((resolve) => {
      settlePicker = resolve;
    });
  };
  return (target: any) => {
    if (!settlePicker) throw new Error('目录选择器没有挂起');
    settlePicker(target);
  };
}

beforeEach(() => {
  harness.pending = [];
  harness.encodeCalls = [];
  harness.disposed = 0;
  harness.saved = [];
  harness.revealed = [];
  harness.chooseCalls = 0;
  harness.chooseTarget = async () => {
    harness.chooseCalls += 1;
    return { kind: 'desktop-directory', path: '/tmp/输出 目录', reservedFileNames: new Set<string>() };
  };
  harness.saveImpl = async (_target: any, fileName: string) => fileName;
  bitmapSizes = [
    { width: 1200, height: 800 },
    { width: 600, height: 400 },
  ];
  urlCounter = 0;
  closedBitmaps.length = 0;

  vi.stubGlobal('createImageBitmap', vi.fn(async () => {
    const next = bitmapSizes.shift() ?? { width: 1200, height: 800 };
    return bitmap(next.width, next.height);
  }));
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:image-tool-${(urlCounter += 1)}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((contextId: string) => {
    if (contextId !== '2d') return null;
    return {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
    } as unknown as CanvasRenderingContext2D;
  }) as never);
});

afterEach(() => {
  mounted?.app.unmount();
  mounted?.container.remove();
  mounted = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('图片压缩工具', () => {
  it('starts empty with three formats and a disabled save button', async () => {
    const { container } = await mountTool();
    expect(container.textContent).toContain('选择一张图片开始压缩');
    expect(container.querySelectorAll('.image-tool-format')).toHaveLength(3);
    expect(buttonByText(container, '保存为…').disabled).toBe(true);
  });

  it('encodes the imported image and shows the compressed size', async () => {
    const { container } = await mountTool();
    await chooseFile(container, pngFile());

    expect(harness.encodeCalls).toHaveLength(1);
    expect(harness.encodeCalls[0]).toMatchObject({ format: 'jpeg', quality: 75, width: 1200, height: 800 });

    resolveEncode(0, 80_000, 1200, 800);
    await settle();

    expect(container.textContent).toContain('1200×800');
    expect(container.textContent).toContain('200.0 KB → 80.0 KB（-60%）');
    expect(buttonByText(container, '保存为…').disabled).toBe(false);
    const overlay = query(container, '.image-tool-compare-overlay') as HTMLImageElement;
    expect(overlay.getAttribute('src')).toBe('blob:image-tool-2');
  });

  it('debounces parameter changes and re-encodes with the new quality', async () => {
    vi.useFakeTimers();
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    resolveEncode(0, 90_000, 1200, 800);
    await settle();

    const quality = query(container, 'input[aria-label="质量"]') as HTMLInputElement;
    for (const value of ['40', '45', '52']) {
      quality.value = value;
      quality.dispatchEvent(new Event('input'));
    }
    await vi.advanceTimersByTimeAsync(50);
    expect(harness.encodeCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(harness.encodeCalls).toHaveLength(2);
    expect(harness.encodeCalls[1]).toMatchObject({ quality: 52, format: 'jpeg' });
  });

  it('drops a stale encode so a late result cannot replace the latest one', async () => {
    vi.useFakeTimers();
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    resolveEncode(0, 90_000, 1200, 800);
    await settle();

    const quality = query(container, 'input[aria-label="质量"]') as HTMLInputElement;
    quality.value = '30';
    quality.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(250);

    (query(container, '[aria-label="WebP"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.encodeCalls).toHaveLength(3);

    resolveEncode(2, 3_000, 1200, 800);
    await settle();
    expect(container.textContent).toContain('3.0 KB');

    resolveEncode(1, 999_999, 1200, 800);
    await settle();
    expect(container.textContent).toContain('3.0 KB');
    expect(container.textContent).not.toContain('1.00 MB');
  });

  it('keeps the newest material when two imports resolve out of order', async () => {
    const { container } = await mountTool();
    await chooseFile(container, pngFile('第一张.png'));
    await chooseFile(container, pngFile('第二张.png'));

    expect(harness.encodeCalls).toHaveLength(2);
    expect(harness.encodeCalls[1]).toMatchObject({ width: 600, height: 400 });

    resolveEncode(1, 50_000, 600, 400);
    resolveEncode(0, 90_000, 1200, 800);
    await settle();

    expect(container.textContent).toContain('600×400');
    expect(container.textContent).not.toContain('1200×800');
  });

  it('shows an encode error instead of pretending a result exists', async () => {
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    harness.pending[0].reject(new Error('编码器初始化失败'));
    await settle();

    const alert = query(container, '.image-tool-error');
    expect(alert?.textContent).toContain('编码器初始化失败');
    expect(buttonByText(container, '保存为…').disabled).toBe(true);
  });

  it('rejects unsupported files without clearing the previous result', async () => {
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    resolveEncode(0, 90_000, 1200, 800);
    await settle();

    await chooseFile(container, new File([new Uint8Array(2)], '动图.gif', { type: 'image/gif' }));
    expect(query(container, '.image-tool-error')?.textContent).toContain('只支持 JPEG / PNG / WebP');
    expect(container.textContent).toContain('90.0 KB');
  });

  it('saves through the existing desktop save path with a non-overwriting name', async () => {
    const { container } = await mountTool();
    await chooseFile(container, pngFile('海报 01.png'));
    resolveEncode(0, 120_000, 1200, 800);
    await settle();

    buttonByText(container, '保存为…').click();
    await settle();

    expect(harness.saved).toHaveLength(1);
    expect(harness.saved[0].fileName).toBe('海报 01-compressed.jpg');
    expect(harness.saved[0].blob.size).toBe(120_000);
    expect(container.textContent).toContain('已保存：海报 01-compressed.jpg');
    expect(buttonByText(container, '显示位置')).toBeTruthy();
  });

  it('does not write anything when the user cancels the directory picker', async () => {
    harness.chooseTarget = async () => ({ kind: 'cancelled' });
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    resolveEncode(0, 120_000, 1200, 800);
    await settle();

    buttonByText(container, '保存为…').click();
    await settle();

    expect(harness.saved).toHaveLength(0);
    expect(container.textContent).not.toContain('已保存');
  });

  it('switches to PNG options and encodes with the lossless level', async () => {
    vi.useFakeTimers();
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    resolveEncode(0, 90_000, 1200, 800);
    await settle();

    (query(container, '[aria-label="PNG"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(250);

    expect(query(container, 'input[aria-label="质量"]')).toBeNull();
    const level = query(container, 'input[aria-label="PNG 优化级别"]') as HTMLInputElement;
    expect(level.value).toBe('2');

    level.value = '5';
    level.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.encodeCalls.at(-1)).toMatchObject({ format: 'png', pngLevel: 5, quality: 5 });
  });

  it('re-encodes at the requested width without upscaling', async () => {
    vi.useFakeTimers();
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    resolveEncode(0, 90_000, 1200, 800);
    await settle();

    const width = query(container, 'input[aria-label="输出宽度"]') as HTMLInputElement;
    width.value = '600';
    width.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.encodeCalls.at(-1)).toMatchObject({ width: 600, height: 400 });

    width.value = '4000';
    width.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.encodeCalls.at(-1)).toMatchObject({ width: 1200 });
  });

  it('drops a late result and disposes the worker after unmount', async () => {
    const { container, app } = await mountTool();
    await chooseFile(container, pngFile());
    app.unmount();
    mounted = undefined;

    expect(harness.disposed).toBe(1);
    const pending = harness.pending[0];
    pending.resolve({ bytes: new Uint8Array(1000), width: 1200, height: 800, mime: 'image/jpeg' });
    await settle();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:image-tool-2');
  });

  it('blocks saving the old JPEG result during the PNG debounce window', async () => {
    vi.useFakeTimers();
    const { container } = await mountTool();
    await chooseFile(container, pngFile('海报 01.png'));
    resolveEncode(0, 90_000, 1200, 800, 'jpeg');
    await settle();
    expect(buttonByText(container, '保存为…').disabled).toBe(false);

    (query(container, '[aria-label="PNG"]') as HTMLButtonElement).click();
    await nextTick();

    // 去抖/编码尚未完成：旧结果可以继续看，但绝对不能保存。
    expect(buttonByText(container, '保存为…').disabled).toBe(true);
    expect(container.textContent).toContain('参数已变化，上一份结果不可保存');
    buttonByText(container, '保存为…').click();
    await settle();
    expect(harness.saved).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(250);
    resolveEncode(1, 43_210, 1200, 800, 'png');
    await settle();
    expect(buttonByText(container, '保存为…').disabled).toBe(false);

    buttonByText(container, '保存为…').click();
    await settle();

    // 文件名扩展名、MIME 与内容都来自那份 PNG 结果，而不是当前选择器。
    expect(harness.saved).toHaveLength(1);
    expect(harness.saved[0].fileName).toBe('海报 01-compressed.png');
    expect(harness.saved[0].blob.type).toBe('image/png');
    expect(harness.saved[0].blob.size).toBe(43_210);
  });

  it('keeps the previous result unsavable after an encode failure', async () => {
    vi.useFakeTimers();
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    resolveEncode(0, 90_000, 1200, 800, 'jpeg');
    await settle();

    const quality = query(container, 'input[aria-label="质量"]') as HTMLInputElement;
    quality.value = '30';
    quality.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(250);
    harness.pending[1].reject(new Error('编码器崩溃'));
    await settle();

    expect(query(container, '.image-tool-error')?.textContent).toContain('编码器崩溃');
    expect(buttonByText(container, '保存为…').disabled).toBe(true);
    buttonByText(container, '保存为…').click();
    await settle();
    expect(harness.saved).toHaveLength(0);
  });

  it('cancels the save when the format changes while the directory picker is open', async () => {
    vi.useFakeTimers();
    const { container } = await mountTool();
    await chooseFile(container, pngFile('海报 01.png'));
    resolveEncode(0, 90_000, 1200, 800, 'jpeg');
    await settle();

    const resolvePicker = pendDirectoryPicker();
    buttonByText(container, '保存为…').click();
    await settle();
    expect(harness.chooseCalls).toBe(1);

    // 弹窗还开着时改格式：等新编码完成后再选择目录，也不能拿旧 JPEG 结果去写。
    (query(container, '[aria-label="WebP"]') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.encodeCalls.at(-1)).toMatchObject({ format: 'webp' });
    resolveEncode(1, 55_000, 1200, 800, 'webp');
    await settle();

    resolvePicker({ kind: 'desktop-directory', path: '/tmp/输出 目录', reservedFileNames: new Set<string>() });
    await settle();

    expect(harness.saved).toHaveLength(0);
    expect(container.textContent).toContain('素材或参数已变化，本次保存已取消');

    // 再次保存：重新走一次完整流程（取消不缓存），写入的是当前 WebP 结果。
    harness.chooseTarget = async () => {
      harness.chooseCalls += 1;
      return { kind: 'desktop-directory', path: '/tmp/输出 目录', reservedFileNames: new Set<string>() };
    };
    buttonByText(container, '保存为…').click();
    await settle();
    expect(harness.saved).toHaveLength(1);
    expect(harness.saved[0].fileName).toBe('海报 01-compressed.webp');
    expect(harness.saved[0].blob.type).toBe('image/webp');
    expect(harness.saved[0].blob.size).toBe(55_000);
  });

  it('cancels the save when the image changes while the directory picker is open', async () => {
    const { container } = await mountTool();
    await chooseFile(container, pngFile('旧图.png'));
    resolveEncode(0, 90_000, 1200, 800, 'jpeg');
    await settle();

    const resolvePicker = pendDirectoryPicker();
    buttonByText(container, '保存为…').click();
    await settle();
    expect(harness.chooseCalls).toBe(1);

    await chooseFile(container, pngFile('新图.png'));
    expect(harness.encodeCalls.at(-1)).toMatchObject({ width: 600, height: 400 });
    resolveEncode(1, 61_000, 600, 400, 'jpeg');
    await settle();

    resolvePicker({ kind: 'desktop-directory', path: '/tmp/输出 目录', reservedFileNames: new Set<string>() });
    await settle();

    expect(harness.saved).toHaveLength(0);
    expect(container.textContent).toContain('素材或参数已变化，本次保存已取消');
    expect(container.textContent).not.toContain('旧图-compressed');
  });

  it('re-opens the directory picker after the user cancels it', async () => {
    harness.chooseTarget = async () => {
      harness.chooseCalls += 1;
      return harness.chooseCalls === 1
        ? { kind: 'cancelled' }
        : { kind: 'desktop-directory', path: '/tmp/输出 目录', reservedFileNames: new Set<string>() };
    };
    const { container } = await mountTool();
    await chooseFile(container, pngFile('海报 01.png'));
    resolveEncode(0, 90_000, 1200, 800, 'jpeg');
    await settle();

    buttonByText(container, '保存为…').click();
    await settle();
    expect(harness.chooseCalls).toBe(1);
    expect(harness.saved).toHaveLength(0);

    // 取消不能被缓存：再次点击必须重新弹出选择器并成功写入。
    buttonByText(container, '保存为…').click();
    await settle();
    expect(harness.chooseCalls).toBe(2);
    expect(harness.saved).toHaveLength(1);
    expect(harness.saved[0].fileName).toBe('海报 01-compressed.jpg');
    expect(container.textContent).toContain('已保存：海报 01-compressed.jpg');
  });

  it('keeps odd-sized images untouched and rounds scaled heights proportionally', async () => {
    vi.useFakeTimers();
    const { container } = await mountTool();

    bitmapSizes = [{ width: 101, height: 101 }];
    await chooseFile(container, pngFile('101.png'));
    expect(harness.encodeCalls.at(-1)).toMatchObject({ width: 101, height: 101 });
    resolveEncode(0, 1_000, 101, 101, 'png');
    await settle();

    bitmapSizes = [{ width: 1, height: 1 }];
    await chooseFile(container, pngFile('1px.png'));
    expect(harness.encodeCalls.at(-1)).toMatchObject({ width: 1, height: 1 });
    resolveEncode(1, 90, 1, 1, 'png');
    await settle();

    bitmapSizes = [{ width: 1000, height: 333 }];
    await chooseFile(container, pngFile('奇数高.png'));
    const width = query(container, 'input[aria-label="输出宽度"]') as HTMLInputElement;
    width.value = '500';
    width.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(250);
    // 333 × 500 / 1000 = 166.5 → 167（不强制偶数）
    expect(harness.encodeCalls.at(-1)).toMatchObject({ width: 500, height: 167 });
  });
  it('keeps comparison dragging separate from image panning', async () => {
    const { container } = await mountTool();
    await chooseFile(container, pngFile());
    resolveEncode(0, 1000, 1200, 800);
    await settle();
    const compare = container.querySelector<HTMLElement>('.image-tool-compare')!;
    const divider = container.querySelector<HTMLElement>('.image-tool-compare-divider')!;
    vi.spyOn(compare, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 100 } as DOMRect);
    const pointer = (type: string, x: number) => Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 50 }), { pointerId: 1 });
    compare.dispatchEvent(pointer('pointerdown', 150));
    compare.dispatchEvent(pointer('pointermove', 180));
    compare.dispatchEvent(pointer('pointerup', 180));
    await settle();
    expect(divider.getAttribute('aria-valuenow')).toBe('50');
    divider.dispatchEvent(pointer('pointerdown', 100));
    divider.dispatchEvent(pointer('pointermove', 150));
    divider.dispatchEvent(pointer('pointerup', 150));
    await settle();
    expect(divider.getAttribute('aria-valuenow')).toBe('75');
  });

});
