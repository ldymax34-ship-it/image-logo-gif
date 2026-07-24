import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GIF media multi-page entry', () => {
  it('keeps standalone Vue modules for the embedded GIF and watermark tools', () => {
    expect(existsSync(resolve(process.cwd(), 'src/gif-tool/main.ts'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/watermark-tool/main.ts'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/gif-tool/GifTool.vue'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/watermark-tool/WatermarkTool.vue'))).toBe(true);
  });
});
