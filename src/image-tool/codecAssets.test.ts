import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 随包 wasm 的防漂移检查：版本由 package.json 的 @jsquash 精确版本锁定，
 * `public/codecs/` 里的文件必须与 node_modules 中的一致，否则构建出的
 * 编码器与声明的许可证/版本不符。
 */

const ROOT = process.cwd();
const CODECS = [
  {
    packageName: '@jsquash/jpeg',
    modulePath: 'node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
    workerHint: 'mozjpeg_enc.wasm',
    bytes: 269_882,
  },
  {
    packageName: '@jsquash/webp',
    modulePath: 'node_modules/@jsquash/webp/codec/enc/webp_enc.wasm',
    workerHint: 'webp_enc.wasm',
    bytes: 281_261,
  },
  {
    packageName: '@jsquash/oxipng',
    modulePath: 'node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
    workerHint: 'squoosh_oxipng_bg.wasm',
    bytes: 164_172,
  },
];

function read(relative: string): Buffer {
  return readFileSync(join(ROOT, relative));
}

describe('随包图片编码器 wasm', () => {
  it('pins exact @jsquash versions instead of ranges', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...packageJson.dependencies, ...packageJson.devDependencies };
    for (const codec of CODECS) {
      expect(all[codec.packageName]).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it.each(CODECS)('resolves a valid wasm file for $packageName', (codec) => {
    const stats = statSync(join(ROOT, codec.modulePath));
    expect(stats.size).toBe(codec.bytes);
    const bytes = read(codec.modulePath);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  });

  it('lets Vite resolve the wasm through import.meta.url instead of ?url imports', () => {
    const worker = readFileSync(join(ROOT, 'src/image-tool/codecs.worker.ts'), 'utf-8');
    expect(worker).not.toMatch(/\?url/);
    expect(worker).toContain("new URL('../../node_modules/@jsquash/");
    for (const codec of CODECS) {
      expect(worker).toContain(codec.workerHint);
    }
  });
});
