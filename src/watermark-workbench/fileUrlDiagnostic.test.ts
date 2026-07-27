import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { formatFileUrlDiagnostic, mimeForPath, runFileUrlDiagnostic } from './fileUrlDiagnostic';

const assetConvert = async (path: string) => `asset://localhost/${encodeURIComponent(path)}`;
const fsProbe = async () => ({ exists: true, metadata: { isFile: true, size: 12 } });
const htmlImageOk = async (url: string) => ({ onload: true, currentSrc: url, complete: true, naturalWidth: 100, naturalHeight: 50 });
const fetchOk = async () => ({ status: 200, ok: true, contentType: 'image/png', contentLength: '12' });
const fabricOk = async (url: string) => ({ hasObject: true, width: 100, height: 50 });
const createObjectURL = (blob: Blob) => `blob:diagnostic-${blob.type}`;
const revokeObjectURL = vi.fn();

const ONE_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const capabilities = JSON.parse(readFileSync(new URL('../../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));

function successfulOptions(rawPath: string) {
  return {
    target: 'background' as const, rawPath,
    convertFileSrc: assetConvert, readFile: async () => ONE_PNG_BYTES, fsProbe,
    htmlImageProbe: htmlImageOk, fetchProbe: fetchOk, fabricProbe: fabricOk, createObjectURL, revokeObjectURL,
  };
}

describe('RC file URL diagnostic ACL contract', () => {
  it('adds exactly the three fs command permissions without expanding scope', () => {
    const fsCommandPermissions = capabilities.permissions.filter((permission: unknown) => typeof permission === 'string' && permission.startsWith('fs:allow-'));
    expect(fsCommandPermissions).toEqual(['fs:allow-stat', 'fs:allow-read', 'fs:allow-read-file']);
    const scope = capabilities.permissions.find((permission: unknown): permission is { identifier: string; allow: unknown } => (
      typeof permission === 'object' && permission !== null && 'identifier' in permission && permission.identifier === 'fs:scope'
    ));
    expect(scope).toEqual({
      identifier: 'fs:scope',
      allow: [
        { path: '$HOME/**' },
        { path: '$DOWNLOAD/**' },
        { path: '$DESKTOP/**' },
        { path: '$DOCUMENT/**' },
        { path: '$PICTURE/**' },
      ],
    });
  });
});

describe('RC file URL diagnostic mime', () => {
  it('maps png/jpg/jpeg/webp/gif and falls back to octet-stream', () => {
    expect(mimeForPath('/tmp/a.png')).toBe('image/png');
    expect(mimeForPath('/tmp/a.JPG')).toBe('image/jpeg');
    expect(mimeForPath('/tmp/a.webp')).toBe('image/webp');
    expect(mimeForPath('/tmp/a.gif')).toBe('image/gif');
    expect(mimeForPath('/tmp/a.txt')).toBe('application/octet-stream');
  });
});

describe('RC file URL diagnostic A/B report', () => {
  it('runs both blob and asset strategies and keeps session-only metadata', async () => {
    const readFile = vi.fn(async () => ONE_PNG_BYTES);
    const convertFileSrc = vi.fn(assetConvert);
    const revoke = vi.fn();
    const report = await runFileUrlDiagnostic({
      ...successfulOptions('/tmp/中文 空格/样例.png'), readFile, convertFileSrc, revokeObjectURL: revoke,
      appVersion: '0.1.35-rc.2-diagnostic', attemptId: 'attempt-test',
    });
    expect(report.rawPath).toContain('中文 空格');
    expect(report).toMatchObject({ target: 'background', appVersion: '0.1.35-rc.2-diagnostic', attemptId: 'attempt-test' });
    expect(report.platform).toBeTruthy();
    expect(report.architecture).toBe('not exposed by WebView');
    expect(report.strategies.map((s) => s.strategy)).toEqual(['blob', 'asset-protocol']);
    const blob = report.strategies.find((s) => s.strategy === 'blob')!;
    expect(blob.steps.map((s) => s.stage)).toEqual(expect.arrayContaining(['read-file', 'mime', 'create-blob-url', 'blob-image', 'blob-fabric', 'revoke']));
    expect(blob.steps.find((s) => s.stage === 'revoke')).toMatchObject({ outcome: 'info', details: { revoked: true } });
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:diagnostic-image/png');
    const asset = report.strategies.find((s) => s.strategy === 'asset-protocol')!;
    expect(report.convertedUrl).toContain('asset://');
    expect(asset.steps.map((s) => s.stage)).toEqual(expect.arrayContaining(['convert-file-src', 'asset-image', 'asset-fetch', 'asset-fabric']));
    expect(formatFileUrlDiagnostic(report)).toContain('样例.png');
  });

  it('marks Fabric probes skipped when an independent diagnostic entry point does not provide them', async () => {
    const { fabricProbe: _fabricProbe, ...options } = successfulOptions('/tmp/no-fabric.png');
    const report = await runFileUrlDiagnostic(options);
    const blob = report.strategies.find((strategy) => strategy.strategy === 'blob')!;
    const asset = report.strategies.find((strategy) => strategy.strategy === 'asset-protocol')!;
    expect(blob.steps.find((step) => step.stage === 'blob-fabric')).toMatchObject({ outcome: 'info', details: { skipped: true, reason: 'probe-not-provided' } });
    expect(asset.steps.find((step) => step.stage === 'asset-fabric')).toMatchObject({ outcome: 'info', details: { skipped: true, reason: 'probe-not-provided' } });
  });

  it('passes the original absolute path to readFile and convertFileSrc without manual modification', async () => {
    const readFile = vi.fn(async () => ONE_PNG_BYTES);
    const convertFileSrc = vi.fn(async (path: string) => `asset://localhost/${encodeURIComponent(path)}`);
    await runFileUrlDiagnostic({
      ...successfulOptions('/Users/tang/桌面/P7/简中.png'), readFile, convertFileSrc,
    });
    expect(readFile).toHaveBeenCalledWith('/Users/tang/桌面/P7/简中.png');
    expect(convertFileSrc).toHaveBeenCalledWith('/Users/tang/桌面/P7/简中.png');
  });

  it('continues the asset strategy when the blob readFile ACL/read fails', async () => {
    const readFile = vi.fn(() => Promise.reject(new Error('Command plugin:fs|read_file not allowed by ACL')));
    const convertFileSrc = vi.fn(assetConvert);
    const report = await runFileUrlDiagnostic({
      ...successfulOptions('/tmp/logo.png'), readFile, convertFileSrc,
    });
    const blob = report.strategies.find((s) => s.strategy === 'blob')!;
    expect(blob.steps.find((s) => s.stage === 'read-file')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('not allowed by ACL') } });
    expect(blob.steps.some((s) => s.stage === 'create-blob-url')).toBe(false);
    const asset = report.strategies.find((s) => s.strategy === 'asset-protocol')!;
    expect(asset.steps.find((s) => s.stage === 'convert-file-src')).toMatchObject({ outcome: 'ok' });
    expect(asset.steps.find((s) => s.stage === 'asset-fabric')).toMatchObject({ outcome: 'ok' });
  });

  it('continues asset diagnostics after readFile times out', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulOptions('/tmp/image.png'), timeoutMs: 5,
      readFile: () => new Promise(() => {}),
    });
    const blob = report.strategies.find((s) => s.strategy === 'blob')!;
    expect(blob.steps.find((s) => s.stage === 'read-file')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('read-file timed out') } });
    const asset = report.strategies.find((s) => s.strategy === 'asset-protocol')!;
    expect(asset.steps.find((s) => s.stage === 'asset-fabric')).toMatchObject({ outcome: 'ok' });
  });

  it('keeps blob and asset probes independent when the blob image probe times out', async () => {
    const revoke = vi.fn();
    const report = await runFileUrlDiagnostic({
      ...successfulOptions('/tmp/image.png'), timeoutMs: 5,
      htmlImageProbe: (url) => url.startsWith('blob:') ? new Promise(() => {}) : htmlImageOk(url),
      revokeObjectURL: revoke,
    });
    const blob = report.strategies.find((s) => s.strategy === 'blob')!;
    expect(blob.steps.find((s) => s.stage === 'blob-image')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('blob-image timed out') } });
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:diagnostic-image/png');
    const asset = report.strategies.find((s) => s.strategy === 'asset-protocol')!;
    expect(asset.steps.find((s) => s.stage === 'asset-image')).toMatchObject({ outcome: 'ok' });
  });

  it('continues asset diagnostics when blob Fabric loading fails', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulOptions('/tmp/image.png'),
      fabricProbe: async (url) => {
        if (url.startsWith('blob:')) throw new Error('blob fabric failed');
        return fabricOk(url);
      },
    });
    const blob = report.strategies.find((s) => s.strategy === 'blob')!;
    expect(blob.steps.find((s) => s.stage === 'blob-fabric')).toMatchObject({ outcome: 'error', details: { message: 'blob fabric failed' } });
    const asset = report.strategies.find((s) => s.strategy === 'asset-protocol')!;
    expect(asset.steps.find((s) => s.stage === 'asset-fabric')).toMatchObject({ outcome: 'ok' });
  });

  it('records createObjectURL failures at their own stage and continues asset diagnostics', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulOptions('/tmp/image.png'),
      createObjectURL: () => { throw new Error('blob URL unavailable'); },
    });
    const blob = report.strategies.find((s) => s.strategy === 'blob')!;
    expect(blob.steps.find((s) => s.stage === 'read-file')).toMatchObject({ outcome: 'ok' });
    expect(blob.steps.find((s) => s.stage === 'create-blob-url')).toMatchObject({ outcome: 'error', details: { message: 'blob URL unavailable' } });
    const asset = report.strategies.find((s) => s.strategy === 'asset-protocol')!;
    expect(asset.steps.find((s) => s.stage === 'asset-fabric')).toMatchObject({ outcome: 'ok' });
  });

  it('records revoke failures after using the exact created URL once', async () => {
    const revoke = vi.fn(() => { throw new Error('revoke failed'); });
    const report = await runFileUrlDiagnostic({ ...successfulOptions('/tmp/image.png'), revokeObjectURL: revoke });
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:diagnostic-image/png');
    const blob = report.strategies.find((s) => s.strategy === 'blob')!;
    expect(blob.steps.find((s) => s.stage === 'revoke')).toMatchObject({ outcome: 'error', details: { message: 'revoke failed' } });
  });

  it('records timeouts when the asset conversion bridge never resolves', async () => {
    const report = await runFileUrlDiagnostic({
      ...successfulOptions('/tmp/image.png'), timeoutMs: 5, convertFileSrc: () => new Promise(() => {}),
    });
    const asset = report.strategies.find((s) => s.strategy === 'asset-protocol')!;
    expect(asset.steps.find((s) => s.stage === 'convert-file-src')).toMatchObject({ outcome: 'error', details: { message: expect.stringContaining('convert-file-src timed out') } });
    expect(asset.steps.some((s) => s.stage === 'asset-image')).toBe(false);
  });
});
