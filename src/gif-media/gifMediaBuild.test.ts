import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GIF_TOOL_PAGE_PATH, WATERMARK_TOOL_PAGE_PATH } from '../app/gifMediaLauncher';

describe('GIF media multi-page entry', () => {
  it('keeps standalone Vite pages for the isolated GIF and watermark tools', () => {
    expect(GIF_TOOL_PAGE_PATH).toBe('/gif-tool.html');
    expect(WATERMARK_TOOL_PAGE_PATH).toBe('/watermark-tool.html');
    expect(existsSync(resolve(process.cwd(), 'gif-tool.html'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'watermark-tool.html'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/gif-tool/main.ts'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/watermark-tool/main.ts'))).toBe(true);
  });
});
