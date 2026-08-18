import { describe, expect, it } from 'vitest';
import { isRevealableOutputPath, joinNativePath } from './fileSystem';

describe('joinNativePath', () => {
  it('joins a posix directory and file name with a single separator', () => {
    expect(joinNativePath('/Users/me/输出', 'hero.png')).toBe('/Users/me/输出/hero.png');
  });

  it('strips a trailing separator before joining', () => {
    expect(joinNativePath('/Users/me/输出/', 'hero.png')).toBe('/Users/me/输出/hero.png');
    expect(joinNativePath('C:\\Users\\me\\输出\\', 'hero.png')).toBe('C:\\Users\\me\\输出\\hero.png');
  });

  it('preserves native filesystem roots', () => {
    expect(joinNativePath('/', 'hero.png')).toBe('/hero.png');
    expect(joinNativePath('C:\\', 'hero.png')).toBe('C:\\hero.png');
  });

  it('preserves spaces and non-ASCII in both directory and resolved file name', () => {
    expect(joinNativePath('/tmp/中文 空格/素材', '封面_2.png')).toBe('/tmp/中文 空格/素材/封面_2.png');
  });

  it('joins a collision-renamed actual file name', () => {
    expect(joinNativePath('/tmp/输出', 'hero_2.png')).toBe('/tmp/输出/hero_2.png');
  });

  it('uses a backslash separator for Windows drive-letter paths', () => {
    expect(joinNativePath('C:\\Users\\me\\输出', 'hero.png')).toBe('C:\\Users\\me\\输出\\hero.png');
  });
});

describe('isRevealableOutputPath', () => {
  it('accepts absolute native paths', () => {
    expect(isRevealableOutputPath('/Users/me/输出/hero.png')).toBe(true);
    expect(isRevealableOutputPath('C:\\Users\\me\\输出\\hero.png')).toBe(true);
  });

  it('rejects a bare file name (browser/download output)', () => {
    expect(isRevealableOutputPath('hero.png')).toBe(false);
    expect(isRevealableOutputPath('封面_2.png')).toBe(false);
  });

  it('rejects relative paths that cannot be safely revealed as native output', () => {
    expect(isRevealableOutputPath('output/hero.png')).toBe(false);
    expect(isRevealableOutputPath('output\\hero.png')).toBe(false);
  });

  it('rejects missing and empty paths', () => {
    expect(isRevealableOutputPath(undefined)).toBe(false);
    expect(isRevealableOutputPath('')).toBe(false);
  });
});
