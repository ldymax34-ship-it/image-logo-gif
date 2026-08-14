import { describe, expect, it } from 'vitest';
import {
  applyVideoMediaEvent,
  clampMonotonicProgress,
  createVideoTask,
  supportsVideoWatermarkPath,
  toVideoPreviewRequest,
  toVideoWatermarkOptions,
  type VideoWatermarkAsset,
} from './videoWatermarkAdapter';
import type { WatermarkBusinessConfig } from './WatermarkWorkbench';

const config: WatermarkBusinessConfig = {
  contentKind: 'text',
  text: '第一行\n\n第三行',
  fontSize: 8,
  rotation: 45,
  opacity: 0.6,
  offsetX: 12,
  offsetY: -8,
  spacingX: 220,
  spacingY: 160,
  pattern: 'tiled',
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
  it('accepts only MP4 and MOV paths and preserves desktop-safe file names', () => {
    expect(supportsVideoWatermarkPath('/tmp/中文 空格/movie.MOV')).toBe(true);
    expect(supportsVideoWatermarkPath('/tmp/movie.mp4')).toBe(true);
    expect(supportsVideoWatermarkPath('/tmp/movie.avi')).toBe(false);
  });

  it('maps shared text and logo configurations without exposing staggered video', () => {
    const text = toVideoWatermarkOptions(config, '/tmp/output');
    expect(text).toMatchObject({ kind: 'text', pattern: 'tiled', sizePercent: 8, opacity: 0.6, spacingX: 220, spacingY: 160, phaseOffset: 0.5 });

    const logo = toVideoWatermarkOptions({ ...config, contentKind: 'logo', pattern: 'single', anchor: 'bottom-right' }, '/tmp/output', '/tmp/logo.png');
    expect(logo).toMatchObject({ kind: 'image', imagePath: '/tmp/logo.png', pattern: 'single', position: 'bottom-right' });

    expect(() => toVideoWatermarkOptions({ ...config, pattern: 'staggered' }, '/tmp/output')).toThrow('错位平铺');
  });

  it('freezes options in preview requests and task snapshots', () => {
    const request = toVideoPreviewRequest(asset, config, '/tmp/output', undefined, 960);
    expect(request).toMatchObject({ inputPath: asset.inputPath, width: 960, duration: 4, timestampSeconds: 1, pattern: 'tiled' });

    const options = toVideoWatermarkOptions(config, '/tmp/output');
    const task = createVideoTask(asset, options);
    options.text = 'changed after enqueue';
    expect(task.options.text).toBe(config.text);
    expect(task.status).toBe('waiting');
    expect(task.progress).toBe(0);
  });

  it('clamps progress monotonically and deduplicates terminal media events', () => {
    expect(clampMonotonicProgress(0.75, 0.4)).toBe(0.75);
    expect(clampMonotonicProgress(0.2, 0.75)).toBe(0.75);
    const tasks = [createVideoTask(asset, toVideoWatermarkOptions(config, '/tmp/output'))];
    const terminalIds = new Set<string>();
    const progress = applyVideoMediaEvent(tasks, { kind: 'progress', taskId: tasks[0].id, progress: 0.8 }, terminalIds);
    expect(progress[0].progress).toBe(0.8);
    const completed = applyVideoMediaEvent(progress, { kind: 'completed', taskId: tasks[0].id, outputPath: '/tmp/output.mp4', outputBytes: 10 }, terminalIds);
    expect(completed[0].status).toBe('completed');
    expect(completed[0].progress).toBe(1);
    const duplicate = applyVideoMediaEvent(completed, { kind: 'failed', taskId: tasks[0].id, message: 'late error' }, terminalIds);
    expect(duplicate[0].status).toBe('completed');
    expect(duplicate[0].error).toBeUndefined();
  });
});
