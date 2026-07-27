import { describe, expect, it, vi } from 'vitest';
import { formatFileUrlDiagnostic, runFileUrlDiagnostic } from './fileUrlDiagnostic';

const never = <T,>() => new Promise<T>(() => {});
const successfulProbes = {
  fsProbe: async () => ({ exists: true, metadata: { isFile: true, size: 12 } }),
  htmlImageProbe: async () => ({ onload: true, currentSrc: 'asset://localhost/example', complete: true, naturalWidth: 100, naturalHeight: 50 }),
  fetchProbe: async () => ({ status: 200, ok: true, contentType: 'image/png', contentLength: '12' }),
  fabricProbe: async () => ({ hasObject: true, width: 100, height: 50 }),
};

const successfulConvert = async () => 'asset://localhost/example.png';

describe('RC file URL diagnostic', () => {
  it('awaits async asset URL conversion and keeps the session-only report metadata', async () => {
    const report = await runFileUrlDiagnostic({
      target: 'background', rawPath: '/tmp/中文 空格/样例.png',
      ...successfulProbes,
      convertFileSrc: async (path) => `asset://localhost/${encodeURIComponent(path)}`, appVersion: '0.1.35-rc.1-diagnostic', attemptId: 'attempt-test',
    });
    expect(report.rawPath).toContain('中文 空格');
    expect(report.convertedUrl).toContain('asset://');
    expect(report).toMatchObject({ target: 'background', appVersion: '0.1.35-rc.1-diagnostic', attemptId: 'attempt-test' });
    expect(report.platform).toBeTruthy();
    expect(report.userAgent).toBeTruthy();
    expect(report.architecture).toBe('not exposed by WebView');
    expect(report.steps.map((item) => item.stage)).toEqual(expect.arrayContaining([
      'dialog-returned-path', 'plugin-fs', 'convertFileSrc', 'html-image', 'fetch', 'fabric-from-url-start', 'fabric-from-url',
    ]));
    expect(formatFileUrlDiagnostic(report)).toContain('样例.png');
  });

  it('records conversion errors without inventing an image error string', async () => {
    const fabricProbe = vi.fn();
    const report = await runFileUrlDiagnostic({
      ...successfulProbes, target: 'watermark-logo', rawPath: '/tmp/logo.png',
      convertFileSrc: () => { throw new TypeError('bridge missing'); }, fabricProbe,
    });
    expect(report.steps.find((item) => item.stage === 'convertFileSrc')).toMatchObject({ outcome: 'error', details: { name: 'TypeError', message: 'bridge missing' } });
    expect(report.steps.some((item) => item.stage === 'html-image')).toBe(false);
    expect(fabricProbe).not.toHaveBeenCalled();
  });

  it('records a timeout when HTMLImageElement never dispatches either callback', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulProbes, target: 'background', rawPath: '/tmp/image.png', convertFileSrc: async () => 'asset://localhost/image.png', htmlImageProbe: () => never(), timeoutMs: 5,
    });
    expect(report.steps.find((item) => item.stage === 'html-image')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('html-image timed out') } });
  });

  it('records a timeout when fetch hangs', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulProbes, target: 'background', rawPath: '/tmp/image.png', convertFileSrc: async () => 'asset://localhost/image.png', fetchProbe: () => never(), timeoutMs: 5,
    });
    expect(report.steps.find((item) => item.stage === 'fetch')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('fetch timed out') } });
  });

  it('records a timeout when FabricImage.fromURL hangs', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulProbes, target: 'watermark-logo', rawPath: '/tmp/logo.png', convertFileSrc: async () => 'asset://localhost/logo.png', fabricProbe: () => never(), timeoutMs: 5,
    });
    expect(report.steps.find((item) => item.stage === 'fabric-from-url')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('fabric-from-url timed out') } });
  });

  it('records a timeout when the Tauri conversion bridge never resolves', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulProbes, target: 'background', rawPath: '/tmp/image.png', convertFileSrc: () => never(), timeoutMs: 5,
    });
    expect(report.steps.find((item) => item.stage === 'convertFileSrc')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('convertFileSrc timed out') } });
    expect(report.steps.some((item) => item.stage === 'html-image')).toBe(false);
  });

  it('records a timeout when the filesystem bridge never resolves', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulProbes, target: 'background', rawPath: '/tmp/image.png', convertFileSrc: successfulConvert,
      fsProbe: () => never(), timeoutMs: 50,
    });
    expect(report.steps.find((item) => item.stage === 'plugin-fs')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('plugin-fs timed out') } });
    expect(report.steps.find((item) => item.stage === 'convertFileSrc')).toMatchObject({ outcome: 'ok' });
  });
});
