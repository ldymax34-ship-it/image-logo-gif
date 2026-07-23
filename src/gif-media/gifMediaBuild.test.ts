import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GIF_MEDIA_PAGE_PATH } from '../app/gifMediaLauncher';

describe('GIF media multi-page entry', () => {
  it('keeps a standalone Vite page for the isolated Vue preview', () => {
    expect(GIF_MEDIA_PAGE_PATH).toBe('/gif-media.html');
    expect(existsSync(resolve(process.cwd(), 'gif-media.html'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/gif-media/main.ts'))).toBe(true);
  });
});
