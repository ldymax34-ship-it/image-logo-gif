import { describe, expect, it, vi } from 'vitest';
import { createLocalFilePreview, localFilePreviewMimeForPath } from './localFilePreview';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('local file preview source', () => {
  it('passes the original absolute path to readFile and creates a typed Blob URL', async () => {
    const readFile = vi.fn(async () => PNG_BYTES);
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBe(PNG_BYTES.byteLength);
      return 'blob:preview-png';
    });
    const revokeObjectURL = vi.fn();
    const source = await createLocalFilePreview('/Users/tang/桌面/中文 空格/样例.png', { readFile, createObjectURL, revokeObjectURL });

    expect(readFile).toHaveBeenCalledWith('/Users/tang/桌面/中文 空格/样例.png');
    expect(source.url).toBe('blob:preview-png');
    source.release();
    source.release();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-png');
  });

  it('maps supported image extensions and falls back safely', () => {
    expect(localFilePreviewMimeForPath('/tmp/a.PNG')).toBe('image/png');
    expect(localFilePreviewMimeForPath('/tmp/a.jpg')).toBe('image/jpeg');
    expect(localFilePreviewMimeForPath('/tmp/a.jpeg')).toBe('image/jpeg');
    expect(localFilePreviewMimeForPath('/tmp/a.webp')).toBe('image/webp');
    expect(localFilePreviewMimeForPath('/tmp/a.gif')).toBe('image/gif');
    expect(localFilePreviewMimeForPath('/tmp/a.txt')).toBe('application/octet-stream');
  });

  it('propagates readFile and createObjectURL failures without creating a releasable URL', async () => {
    await expect(createLocalFilePreview('/tmp/fail.png', {
      readFile: async () => { throw new Error('read failed'); },
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
    })).rejects.toThrow('read failed');

    const revokeObjectURL = vi.fn();
    await expect(createLocalFilePreview('/tmp/fail.png', {
      readFile: async () => PNG_BYTES,
      createObjectURL: () => { throw new Error('create failed'); },
      revokeObjectURL,
    })).rejects.toThrow('create failed');
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
