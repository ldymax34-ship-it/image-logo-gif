import { describe, expect, it } from 'vitest';
import { assertUpdaterSignature, buildPreviewManifest, previewReleaseNotes } from './create-preview-manifest.mjs';

describe('Preview updater manifest', () => {
  it('contains exactly the two preview platforms and signature contents', () => {
    const result = buildPreviewManifest({ version: '0.1.26', notes: 'notes', pubDate: '2026-07-19T00:00:00.000Z', macUrl: 'https://example.com/macos.tar.gz', macSignature: 'mac-signature\n', windowsUrl: 'https://example.com/windows.exe', windowsSignature: 'win-signature\n' });
    expect(Object.keys(result.platforms)).toEqual(['darwin-aarch64', 'windows-x86_64']);
    expect(result.platforms['darwin-aarch64'].signature).toBe('mac-signature');
    expect(result.platforms['windows-x86_64'].signature).toBe('win-signature');
  });
  it('rejects URLs in signature fields', () => expect(() => assertUpdaterSignature('https://example.com/file.sig')).toThrow(/not a URL/));

  it('uses the concise Chinese Preview release note', () => {
    expect(previewReleaseNotes('0.9.4')).toBe('0.9.4：新增自定义构图独立入口，修复首次导入布局、Logo 默认居中及 macOS FFmpeg 检测。');
  });
});
