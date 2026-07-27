// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createMaterialAsset, mimeForPath, releaseMaterialAsset, type CreateMaterialAssetDeps } from './imageMeta';

function makeFile(name: string, type: string, size = 8): File {
  return new File([new Uint8Array(size)], name, { type });
}

function fakeDeps(overrides: Partial<CreateMaterialAssetDeps> = {}): CreateMaterialAssetDeps {
  return {
    readFile: overrides.readFile ?? (async () => new Uint8Array(new ArrayBuffer(16))),
    createObjectURL: overrides.createObjectURL ?? (() => 'blob:test'),
    revokeObjectURL: overrides.revokeObjectURL ?? vi.fn(),
    readSize: overrides.readSize ?? (async () => ({ width: 320, height: 240 })),
  };
}

describe('mimeForPath', () => {
  it('maps common image extensions case-insensitively', () => {
    expect(mimeForPath('/tmp/中文 空格/样例.PNG')).toBe('image/png');
    expect(mimeForPath('a.jpg')).toBe('image/jpeg');
    expect(mimeForPath('a.JPEG')).toBe('image/jpeg');
    expect(mimeForPath('a.webp')).toBe('image/webp');
    expect(mimeForPath('a.gif')).toBe('image/gif');
  });

  it('falls back to octet-stream for unknown extensions', () => {
    expect(mimeForPath('/tmp/notes.txt')).toBe('application/octet-stream');
  });
});

describe('createMaterialAsset (file source)', () => {
  it('builds a MaterialAsset from a File with correct fields', async () => {
    const createObjectURL = vi.fn(() => 'blob:file-1');
    const asset = await createMaterialAsset(
      { kind: 'file', file: makeFile('测试.png', 'image/png', 12) },
      { createObjectURL, readSize: async () => ({ width: 100, height: 200 }) },
    );
    expect(asset.fileName).toBe('测试.png');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.fileSize).toBe(12);
    expect(asset.width).toBe(100);
    expect(asset.height).toBe(200);
    expect(asset.objectUrl).toBe('blob:file-1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('rejects non-image files before creating an object URL', async () => {
    const createObjectURL = vi.fn();
    await expect(createMaterialAsset(
      { kind: 'file', file: makeFile('a.txt', 'text/plain') },
      { createObjectURL, readSize: async () => ({ width: 1, height: 1 }) },
    )).rejects.toThrow('不是图片文件');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe('createMaterialAsset (path source)', () => {
  it('reads the file, derives MIME/basename/size and routes through the shared pipeline', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array(new ArrayBuffer(64)));
    const createObjectURL = vi.fn(() => 'blob:path-1');
    const asset = await createMaterialAsset(
      { kind: 'path', path: '/Users/tang/桌面/中文 空格/样例.PNG' },
      { readFile, createObjectURL, readSize: async () => ({ width: 50, height: 50 }) },
    );
    expect(readFile).toHaveBeenCalledWith('/Users/tang/桌面/中文 空格/样例.PNG');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.fileName).toBe('样例.PNG');
    expect(asset.fileSize).toBe(64);
    expect(asset.objectUrl).toBe('blob:path-1');
    expect(asset.width).toBe(50);
    expect(asset.height).toBe(50);
  });

  it('passes the original path verbatim to readFile (Chinese + spaces)', async () => {
    const readFile = vi.fn().mockResolvedValue(new Uint8Array(new ArrayBuffer(4)));
    await createMaterialAsset({ kind: 'path', path: '/Users/tang/桌面/鸣潮 活动/P7/模板.png' }, { readFile, createObjectURL: () => 'blob:test', readSize: async () => ({ width: 1, height: 1 }) });
    expect(readFile).toHaveBeenCalledWith('/Users/tang/桌面/鸣潮 活动/P7/模板.png');
  });

  it('does not revoke when readFile fails (no object URL was created)', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('ACL denied'));
    const revoke = vi.fn();
    await expect(createMaterialAsset(
      { kind: 'path', path: '/tmp/fail.png' },
      { readFile, revokeObjectURL: revoke, readSize: async () => ({ width: 1, height: 1 }) },
    )).rejects.toThrow('ACL denied');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('does not revoke when object URL creation fails', async () => {
    const revoke = vi.fn();
    await expect(createMaterialAsset(
      { kind: 'path', path: '/tmp/fail.png' },
      {
        readFile: async () => new Uint8Array(new ArrayBuffer(8)),
        createObjectURL: () => { throw new Error('create failed'); },
        revokeObjectURL: revoke,
        readSize: async () => ({ width: 1, height: 1 }),
      },
    )).rejects.toThrow('create failed');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('revokes the object URL when image decoding fails', async () => {
    const createObjectURL = vi.fn(() => 'blob:decode-fail');
    const revoke = vi.fn();
    await expect(createMaterialAsset(
      { kind: 'path', path: '/tmp/bad.png' },
      { readFile: async () => new Uint8Array(new ArrayBuffer(8)), createObjectURL, revokeObjectURL: revoke, readSize: async () => { throw new Error('decode failed'); } },
    )).rejects.toThrow('decode failed');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:decode-fail');
  });
});

describe('releaseMaterialAsset', () => {
  it('releases the object URL exactly once for the same asset (idempotent)', async () => {
    const revoke = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:idem');
    const asset = await createMaterialAsset(
      { kind: 'file', file: makeFile('a.png', 'image/png') },
      { createObjectURL, revokeObjectURL: revoke, readSize: async () => ({ width: 1, height: 1 }) },
    );
    releaseMaterialAsset(asset);
    releaseMaterialAsset(asset);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:idem');
  });

  it('falls back to the global URL.revokeObjectURL for plain assets without a release handle', () => {
    const revoke = vi.fn();
    const urlCtor = URL as unknown as { revokeObjectURL?: (u: string) => void };
    const original = urlCtor.revokeObjectURL;
    urlCtor.revokeObjectURL = revoke;
    try {
      const plain = { id: 'x', fileName: 'x.png', objectUrl: 'blob:plain', width: 1, height: 1, fileSize: 1, mimeType: 'image/png' };
      releaseMaterialAsset(plain);
      expect(revoke).toHaveBeenCalledWith('blob:plain');
    } finally {
      if (original) urlCtor.revokeObjectURL = original;
      else delete urlCtor.revokeObjectURL;
    }
  });

  it('does not let a release failure throw out of releaseMaterialAsset', async () => {
    const revoke = vi.fn().mockImplementation(() => { throw new Error('release failed'); });
    const createObjectURL = vi.fn(() => 'blob:throw-release');
    const asset = await createMaterialAsset(
      { kind: 'file', file: makeFile('a.png', 'image/png') },
      { createObjectURL, revokeObjectURL: revoke, readSize: async () => ({ width: 1, height: 1 }) },
    );
    expect(() => releaseMaterialAsset(asset)).not.toThrow();
  });

  it('produces a plain MaterialAsset with only the serializable public fields', async () => {
    const asset = await createMaterialAsset(
      { kind: 'file', file: makeFile('a.png', 'image/png') },
      fakeDeps(),
    );
    expect(Object.keys(asset).sort()).toEqual(['fileName', 'fileSize', 'height', 'id', 'mimeType', 'objectUrl', 'width']);
    expect(JSON.parse(JSON.stringify(asset))).toEqual(asset);
    expect(Object.getOwnPropertySymbols(asset)).toEqual([]);
  });
});
