import { describe, expect, it } from 'vitest';
import { applyMediaPreset, applyMediaTaskEvent, clampProgress, createMediaTask } from './mediaTypes';

describe('GIF media queue state', () => {
  it('updates a task from real backend events without producing synthetic success', () => {
    const task = createMediaTask('/tmp/中文 空格/input.mp4', 0);
    const running = applyMediaTaskEvent([task], { kind: 'progress', taskId: task.id, progress: 1.4 })[0];
    expect(running.status).toBe('running');
    expect(running.progress).toBe(1);

    const completed = applyMediaTaskEvent([running], { kind: 'completed', taskId: task.id, outputPath: '/tmp/out.gif', outputBytes: 1234 })[0];
    expect(completed).toMatchObject({ status: 'success', progress: 1, outputPath: '/tmp/out.gif', outputBytes: 1234 });
  });

  it('retains an explicit queue failure and supports the 8MB-oriented preset', () => {
    const task = createMediaTask('/tmp/input.mov', 0);
    const failed = applyMediaTaskEvent([task], { kind: 'failed', taskId: task.id, message: 'FFmpeg 处理失败' })[0];
    expect(failed).toMatchObject({ status: 'failed', error: 'FFmpeg 处理失败' });
    expect(applyMediaPreset({ fps: 24, loop: true, preset: 'high', outputDirectory: '/tmp' }, 'target-8mb')).toMatchObject({ fps: 15, width: 960, preset: 'target-8mb' });
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});
