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
    expect(previewReleaseNotes('0.9.3')).toBe('0.9.3：修复首次启动环境检测页深色主题与状态可读性。');
  });
});
