import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  HARD_LIMIT_BYTES,
  TARGET_FILE_BYTES,
  type GifTaskOptions
} from './types';

/**
 * The Rust command deserializes `targetBytes` into a `u64`. A computed value
 * such as `7.8 * 1024 * 1024` (8178892.8) serializes to a JSON float and makes
 * the whole request fail to parse, so the budget must be an integer.
 */
describe('video-to-GIF byte budget', () => {
  it('keeps the byte budget an integer sent as a JSON integer', () => {
    expect(Number.isInteger(TARGET_FILE_BYTES)).toBe(true);
    expect(Number.isInteger(HARD_LIMIT_BYTES)).toBe(true);

    const payload = JSON.stringify({ targetBytes: TARGET_FILE_BYTES });
    expect(payload).toBe('{"targetBytes":7800000}');
    expect(payload).not.toContain('.');
  });

  it('uses the decimal 8 MB ceiling, not 8 MiB', () => {
    expect(HARD_LIMIT_BYTES).toBe(8_000_000);
    expect(HARD_LIMIT_BYTES).not.toBe(8 * 1024 * 1024);
    // The soft budget must stay strictly below the hard ceiling so the renderer
    // retries before it can ever hit the limit.
    expect(TARGET_FILE_BYTES).toBeLessThan(HARD_LIMIT_BYTES);
  });

  it('builds the same integer budget the request payload carries', () => {
    const options: GifTaskOptions = {
      startSeconds: 0,
      endSeconds: 2,
      width: 960,
      fps: 15,
      outputDirectory: '/tmp/中文 输出',
      mode: 'balanced'
    };
    const request = { taskId: 'task-1', inputPath: '/tmp/中文 空格/样例 视频.mp4', options: { ...options, targetBytes: TARGET_FILE_BYTES } };
    const serialized = JSON.stringify(request);
    expect(serialized).toContain('"targetBytes":7800000');
    expect(serialized).not.toMatch(/"targetBytes":[\d.]+\./);
    // FPS is a user hard constraint: the request carries it, and the payload has
    // no field that could let the renderer lower it during compression.
    expect(serialized).toContain('"fps":15');
    expect(serialized).not.toContain('minFps');
    expect(serialized).not.toContain('allowStrongCompression');
  });

  it('reports sizes in decimal units so 8,000,000 B reads as 8.0 MB', () => {
    expect(formatFileSize(8_000_000)).toBe('8.0 MB');
    expect(formatFileSize(7_800_000)).toBe('7.8 MB');
    expect(formatFileSize(500_000)).toBe('500 KB');
  });
});
