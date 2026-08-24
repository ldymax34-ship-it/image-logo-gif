import { describe, expect, it, vi } from 'vitest';
import {
  applyVideoMediaEvent,
  applyVideoQueueEvent,
  applyVideoWatermarkRecommendation,
  allocateVideoDraftOutputPath,
  clampMonotonicProgress,
  clampTimestampSeconds,
  createDesktopFileObjectUrl,
  createVideoTask,
  encoderCapabilitySummary,
  encoderModeLabel,
  formatTimecode,
  supportsVideoWatermarkPath,
  toVideoPreviewRequest,
  toVideoWatermarkOptions,
  videoWatermarkDensity,
  videoWatermarkRenderSummary,
  type VideoWatermarkAsset,
} from './videoWatermarkAdapter';
import { DEFAULT_CONFIG, type WatermarkBusinessConfig } from './WatermarkWorkbench';
import {
  openOutputDirectoryWithAdapter,
  revealOutputFileWithAdapter,
  type DesktopOpenerAdapter,
} from '../gif-media/mediaDesktop';

const config: WatermarkBusinessConfig = {
  contentKind: 'text',
  text: '第一行\n\n第三行',
  fontSize: 8,
  rotation: 45,
  opacity: 0.6,
  offsetX: 12,
  offsetY: -8,
  pattern: 'brick',
  density: 'standard',
  phaseOffset: 0.5,
  anchor: 'center',
};

const asset: VideoWatermarkAsset = {
  id: 'video-1',
  inputPath: '/tmp/中文 空格/movie.MOV',
  fileName: 'movie.MOV',
  metadata: { duration: 4, width: 1280, height: 720, fps: 30, codec: 'h264', hasAudio: true },
};

describe('video watermark adapter', () => {
  it('maps desktop opener actions without constructing shell commands', async () => {
    const openPath = vi.fn(async (path: string) => { expect(path).toBe('/tmp/中文 空格/output'); });
    const revealItemInDir = vi.fn(async (path: string) => { expect(path).toBe('/tmp/中文 空格/output/视频_watermarked.mp4'); });
    const opener: DesktopOpenerAdapter = { openPath, revealItemInDir };
    await openOutputDirectoryWithAdapter(opener, '/tmp/中文 空格/output');
    await revealOutputFileWithAdapter(opener, '/tmp/中文 空格/output/视频_watermarked.mp4');
    expect(openPath).toHaveBeenCalledTimes(1);
    expect(revealItemInDir).toHaveBeenCalledTimes(1);
  });

  it('accepts only MP4 and MOV paths and preserves desktop-safe file names', () => {
    expect(supportsVideoWatermarkPath('/tmp/中文 空格/movie.MOV')).toBe(true);
    expect(supportsVideoWatermarkPath('/tmp/movie.mp4')).toBe(true);
    expect(supportsVideoWatermarkPath('/tmp/movie.avi')).toBe(false);
  });

  it('maps only text to the video contract without exposing logo or staggered video', () => {
    const text = toVideoWatermarkOptions(config, '/tmp/output');
    expect(text).toMatchObject({ kind: 'text', pattern: 'tiled', sizePercent: 8, opacity: 0.6, density: 'medium', angle: 45, quality: 'high', preferHardware: true });
    expect(text).not.toHaveProperty('phaseOffset');
    expect(text).not.toHaveProperty('spacingX');
    expect(text).not.toHaveProperty('spacingY');

    const forcedText = toVideoWatermarkOptions({ ...config, contentKind: 'logo', pattern: 'single', anchor: 'bottom-right' }, '/tmp/output', '/tmp/logo.png');
    expect(forcedText).toMatchObject({ kind: 'text', imagePath: undefined, pattern: 'single', position: 'bottom-right' });

    const brick = toVideoWatermarkOptions({ ...config, pattern: 'brick' }, '/tmp/output');
    expect(brick.pattern).toBe('tiled');
  });

  it('preserves 1% sizePercent for FFmpeg without applying a 16px preview clamp', () => {
    const options = toVideoWatermarkOptions({ ...config, fontSize: 1 }, '/tmp/output');
    expect(options.sizePercent).toBe(1);
  });

  it('freezes options in preview requests and task snapshots', () => {
    const request = toVideoPreviewRequest(asset, config, '/tmp/output', undefined, 960);
    expect(request).toMatchObject({ inputPath: asset.inputPath, width: 960, duration: 4, timestampSeconds: 0, pattern: 'tiled' });

    const options = toVideoWatermarkOptions(config, '/tmp/output');
    const task = createVideoTask(asset, options);
    options.text = 'changed after enqueue';
    expect(task.options.text).toBe(config.text);
    expect(task.status).toBe('waiting');
    expect(task.progress).toBe(0);
    expect(task.submitted).toBe(false);
  });

  it('assigns a unique job id per queue draft while preserving the source id', () => {
    const options = toVideoWatermarkOptions(config, '/tmp/output');
    const first = createVideoTask(asset, options);
    const second = createVideoTask(asset, options);
    expect(first.id).not.toBe(second.id);
    expect(first.sourceId).toBe(asset.id);
    expect(second.sourceId).toBe(asset.id);
    expect(first.options).not.toBe(second.options);
    first.options.text = 'changed';
    expect(second.options.text).toBe(config.text);
  });

  it('allocates unique deterministic draft output paths while avoiding existing targets', () => {
    const used = new Set<string>();
    const existing = new Set(['/tmp/output/P6-GIF1_watermarked.mp4']);
    const first = allocateVideoDraftOutputPath('/tmp/output', 'P6-GIF1.mp4', used, existing);
    expect(first).toBe('/tmp/output/P6-GIF1_watermarked_2.mp4');
    used.add(first);
    const second = allocateVideoDraftOutputPath('/tmp/output', 'P6-GIF1.mp4', used, existing);
    expect(second).toBe('/tmp/output/P6-GIF1_watermarked_3.mp4');
    expect(first).not.toBe(second);
  });

  it('clamps requested timestamps into the known duration', () => {
    expect(clampTimestampSeconds(2.4, 1.5)).toBe(1.5);
    expect(clampTimestampSeconds(-1, 3)).toBe(0);
    expect(formatTimecode(65.25)).toBe('01:05.25');
  });

  it('maps the shared density control to the FFmpeg wire density', () => {
    expect(videoWatermarkDensity({ ...config, density: 'dense' })).toBe('high');
    expect(videoWatermarkDensity({ ...config, density: 'standard' })).toBe('medium');
    expect(videoWatermarkDensity({ ...config, density: 'sparse' })).toBe('low');
  });

  it('applies a recommendation into the shared density contract without a grid truth', () => {
    const recommended = applyVideoWatermarkRecommendation(config, {
      sizePercent: 3,
      density: 'medium',
      columns: 3,
      rows: 3,
      spacingX: 220,
      spacingY: 160,
      opacity: 0.56,
      angle: 30,
      gutterPercent: 18,
      reason: '横屏推荐',
    });
    expect(recommended).toMatchObject({
      contentKind: 'text',
      text: config.text,
      pattern: 'brick',
      fontSize: 3,
      opacity: 0.56,
      rotation: 30,
      density: 'dense',
      phaseOffset: 0.5,
    });
    expect(recommended).not.toHaveProperty('spacingX');
    expect(recommended).not.toHaveProperty('spacingY');
    expect(recommended).not.toHaveProperty('tileColumns');
    expect(recommended).not.toHaveProperty('tileRows');
  });

  it('reapplying a recommendation switches a single watermark back to brick', () => {
    const single = applyVideoWatermarkRecommendation(
      { ...config, pattern: 'single' },
      {
        sizePercent: 4,
        density: 'high',
        columns: 4,
        rows: 3,
        spacingX: 140,
        spacingY: 100,
        opacity: 0.5,
        angle: 30,
        gutterPercent: 18,
        reason: '重新推荐',
      },
    );
    expect(single.pattern).toBe('brick');
    expect(single.density).toBe('dense');
  });

  it('loads valid PNG bytes into a Blob object URL without leaking arbitrary paths', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    const readFile = vi.fn(async () => png);
    let createdBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      createdBlob = blob;
      return 'blob:png-preview';
    });
    const url = await createDesktopFileObjectUrl('/tmp/中文 空格/preview.png', { readFile, createObjectURL });
    expect(readFile).toHaveBeenCalledWith('/tmp/中文 空格/preview.png');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createdBlob).toBeInstanceOf(Blob);
    expect(url).toBe('blob:png-preview');
  });

  it('rejects empty or non-PNG preview bytes before creating a URL', async () => {
    await expect(createDesktopFileObjectUrl('/tmp/empty.png', {
      readFile: async () => new Uint8Array(),
      createObjectURL: () => 'blob:unused',
    })).rejects.toThrow('预览文件为空或不可读取');
  });

  it('clamps progress monotonically and deduplicates terminal media events', () => {
    expect(clampMonotonicProgress(0.75, 0.4)).toBe(0.75);
    expect(clampMonotonicProgress(0.2, 0.75)).toBe(0.75);
    const tasks = [createVideoTask(asset, toVideoWatermarkOptions(config, '/tmp/output'))];
    const progress = applyVideoMediaEvent(tasks, { kind: 'progress', taskId: tasks[0].id, progress: 0.8 });
    expect(progress[0].progress).toBe(0.8);
    const completed = applyVideoMediaEvent(progress, { kind: 'completed', taskId: tasks[0].id, outputPath: '/tmp/output.mp4', outputBytes: 10 });
    expect(completed[0].status).toBe('completed');
    expect(completed[0].progress).toBe(1);
    const duplicate = applyVideoMediaEvent(completed, { kind: 'failed', taskId: tasks[0].id, message: 'late error' });
    expect(duplicate[0].status).toBe('completed');
    expect(duplicate[0].error).toBeUndefined();
  });

  it('keeps a completed job terminal when the same media event is re-applied (StrictMode double-invoke purity)', () => {
    const task = createVideoTask(asset, toVideoWatermarkOptions(config, '/tmp/output'));
    const progressed = applyVideoMediaEvent([task], { kind: 'progress', taskId: task.id, progress: 0.99 });
    const finalized = applyVideoQueueEvent(progressed, { taskId: task.id, status: 'finalizing' });
    expect(finalized[0].status).toBe('finalizing');
    expect(finalized[0].progress).toBe(0.99);

    // The completed event is applied twice against the same `finalized` input,
    // exactly like React StrictMode re-invoking an impure updater. Both results
    // must be completed/100: an impure reducer that mutates shared terminal
    // state would return the unchanged finalizing task on the second pass.
    const completedEvent = { kind: 'completed' as const, taskId: task.id, outputPath: '/tmp/output.mp4', outputBytes: 10 };
    const first = applyVideoMediaEvent(finalized, completedEvent);
    const second = applyVideoMediaEvent(finalized, completedEvent);
    expect(first[0].status).toBe('completed');
    expect(first[0].progress).toBe(1);
    expect(second[0].status).toBe('completed');
    expect(second[0].progress).toBe(1);
  });

  it('keeps failure and cancel terminal and never regresses to finalizing or a lower progress', () => {
    const task = createVideoTask(asset, toVideoWatermarkOptions(config, '/tmp/output'));
    const running = applyVideoMediaEvent([task], { kind: 'progress', taskId: task.id, progress: 0.99 });
    const failed = applyVideoMediaEvent(running, { kind: 'failed', taskId: task.id, message: 'boom' });
    expect(failed[0].status).toBe('failed');
    // A late finalizing/queue status must not regress a terminal failure.
    const regressed = applyVideoQueueEvent(failed, { taskId: task.id, status: 'finalizing' });
    expect(regressed[0].status).toBe('failed');

    const cancelled = applyVideoMediaEvent(running, { kind: 'cancelled', taskId: task.id });
    expect(cancelled[0].status).toBe('cancelled');
    const cancelledRegressed = applyVideoQueueEvent(cancelled, { taskId: task.id, status: 'completed' });
    expect(cancelledRegressed[0].status).toBe('cancelled');
  });

  it('keeps 56% opacity as 0.56 through options and preview request', () => {
    const at56 = { ...config, opacity: 0.56 };
    const options = toVideoWatermarkOptions(at56, '/tmp/output');
    expect(options.opacity).toBe(0.56);
    const request = toVideoPreviewRequest(asset, at56, '/tmp/output', undefined, 960);
    expect(request.opacity).toBe(0.56);
  });

  it('ships the default layout as dense brick at 45 degrees', () => {
    expect(DEFAULT_CONFIG.pattern).toBe('brick');
    expect(DEFAULT_CONFIG.density).toBe('dense');
    expect(DEFAULT_CONFIG.rotation).toBe(45);
    expect(videoWatermarkDensity(DEFAULT_CONFIG)).toBe('high');
  });

  it('deep-freezes placements when a task snapshot is created', () => {
    const options = toVideoWatermarkOptions(config, '/tmp/output');
    options.placements = [{ xPercent: 50, yPercent: 50 }];
    const task = createVideoTask(asset, options);
    options.placements.push({ xPercent: 99, yPercent: 99 });
    options.placements[0].xPercent = 1;
    options.opacity = 0.9;
    expect(task.options.opacity).toBe(config.opacity);
    expect(task.options.placements).toHaveLength(1);
    expect(task.options.placements![0].xPercent).toBe(50);
  });

  it('renders a concise non-sensitive frozen summary for queue rows', () => {
    expect(videoWatermarkRenderSummary(toVideoWatermarkOptions({ ...config, opacity: 0.56 }, '/tmp/output')))
      .toBe('砖型 · 45° · 8% · 56% · 适中');
  });

  it('labels the concrete hardware backend and CPU fallback for the encoder switch', () => {
    const nvenc = { hardwareAvailable: true, backendName: 'NVENC' as const, reason: 'ok', candidates: [] };
    const cpu = { hardwareAvailable: false, backendName: 'CPU' as const, reason: 'n/a', candidates: [] };
    expect(encoderModeLabel(nvenc, true)).toBe('硬件优先（NVENC）');
    expect(encoderModeLabel(nvenc, false)).toBe('CPU 兼容模式');
    expect(encoderModeLabel(cpu, true)).toBe('CPU 兼容模式');
    expect(encoderModeLabel(undefined, true)).toBe('自动（硬件优先）');
  });

  it('summarizes each probed backend with its unavailable reason', () => {
    const capability = {
      hardwareAvailable: false,
      backendName: 'CPU' as const,
      reason: '',
      candidates: [
        { backend: 'nvenc' as const, backendName: 'NVENC' as const, encoder: 'h264_nvenc', available: false, reason: 'Cannot load nvenc library' },
        { backend: 'amf' as const, backendName: 'AMF' as const, encoder: 'h264_amf', available: false, reason: 'Failed to create AMF context' },
      ],
    };
    const summary = encoderCapabilitySummary(capability);
    expect(summary).toContain('硬件编码不可用');
    expect(summary).toContain('NVENC：Cannot load nvenc library');
    expect(summary).toContain('AMF：Failed to create AMF context');
    expect(summary).toContain('将使用 CPU 兼容模式');
  });

  it('summarizes a selected hardware backend without listing failures', () => {
    const capability = {
      hardwareAvailable: true,
      backendName: 'QSV' as const,
      reason: 'QSV 已通过 720p/30fps/120 帧实机编码探测',
      candidates: [
        { backend: 'qsv' as const, backendName: 'QSV' as const, encoder: 'h264_qsv', available: true, reason: '已通过 720p/30fps/120 帧实机编码探测' },
      ],
    };
    expect(encoderCapabilitySummary(capability)).toBe('硬件编码：QSV（已通过探测）');
  });
});
