// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseRecentTools, pushRecentTool } from './appHistory';

describe('appHistory', () => {
  it('keeps only open tools when reading an older local cache', () => {
    const result = parseRecentTools(JSON.stringify([
      { tool: 'gif-compress', at: 4 },
      { tool: 'logo-layout', at: 3 },
      { tool: 'video-watermark', at: 2 },
      { tool: 'batch-template-gif', at: 1 }
    ]));

    // 视频转 GIF is now open; 批量模板 GIF 合成器 still has no entry.
    expect(result.map((entry) => entry.tool)).toEqual(['gif-compress', 'logo-layout', 'video-watermark']);
  });

  it('moves the latest released tool to the front without duplicates', () => {
    const result = pushRecentTool([
      { tool: 'watermark', at: 1 },
      { tool: 'logo-layout', at: 2 }
    ], 'watermark');

    expect(result.map((entry) => entry.tool)).toEqual(['watermark', 'logo-layout']);
  });

  it('records the independent 图片压缩 entry as its own recent tool', () => {
    const result = parseRecentTools(JSON.stringify([
      { tool: 'image-compress', at: 5 },
      { tool: 'gif-compress', at: 4 }
    ]));

    expect(result.map((entry) => entry.tool)).toEqual(['image-compress', 'gif-compress']);
  });

  it('records the independent 自定义构图 entry as its own recent tool', () => {
    const result = parseRecentTools(JSON.stringify([
      { tool: 'custom', at: 3 },
      { tool: 'logo-layout', at: 2 },
      { tool: 'batch-template-gif', at: 1 }
    ]));

    expect(result.map((entry) => entry.tool)).toEqual(['custom', 'logo-layout']);
  });
});
