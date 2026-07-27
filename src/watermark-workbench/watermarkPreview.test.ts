import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the unified image module so these tests focus on loadWatermarkPreview's
// stale/error/release orchestration, not on image decoding or Tauri I/O.
const mocks = vi.hoisted(() => ({
  createMaterialAsset: vi.fn(),
  releaseMaterialAsset: vi.fn(),
}));

vi.mock('../core/image/imageMeta', () => ({
  createMaterialAsset: mocks.createMaterialAsset,
  releaseMaterialAsset: mocks.releaseMaterialAsset,
}));

import { classifyWatermarkPreview, loadWatermarkPreview } from './watermarkPreview';
import type { MaterialAsset } from '../core/image/imageMeta';

const { createMaterialAsset, releaseMaterialAsset } = mocks;

function fakeAsset(url = 'blob:test'): MaterialAsset {
  return { id: 'a', fileName: 'test.png', objectUrl: url, width: 100, height: 100, fileSize: 1, mimeType: 'image/png' };
}

describe('watermark preview adapter', () => {
  beforeEach(() => {
    createMaterialAsset.mockReset();
    releaseMaterialAsset.mockReset();
  });

  it('does not send MP4/MOV through an image decoder', () => {
    expect(classifyWatermarkPreview('/tmp/中文 空格/样例.mp4')).toBe('video');
    expect(classifyWatermarkPreview('clip.MOV')).toBe('video');
    expect(classifyWatermarkPreview('封面 图片.png')).toBe('image');
  });

  it('reports an error when asset creation fails and does not release', async () => {
    createMaterialAsset.mockRejectedValue(new Error('read unavailable'));
    const result = await loadWatermarkPreview({
      path: '/tmp/图片.png',
      fromUrl: vi.fn(),
      isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'error' });
    expect(releaseMaterialAsset).not.toHaveBeenCalled();
  });

  it('returns a visible decoder failure instead of a second verifier result', async () => {
    createMaterialAsset.mockResolvedValue(fakeAsset());
    const result = await loadWatermarkPreview({
      path: '/tmp/图片.png',
      fromUrl: async () => { throw new Error('network error'); },
      isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'error' });
    expect(releaseMaterialAsset).toHaveBeenCalledTimes(1);
  });

  it('drops an old late failure so it cannot overwrite a newer success', async () => {
    let current = false;
    createMaterialAsset
      .mockResolvedValueOnce(fakeAsset('blob:old'))
      .mockResolvedValueOnce(fakeAsset('blob:new'));
    const old = loadWatermarkPreview({
      path: '/tmp/old.png',
      fromUrl: async () => { current = false; throw new Error('late failure'); },
      isCurrent: () => current,
    });
    const next = loadWatermarkPreview({
      path: '/tmp/new.png',
      fromUrl: async () => ({ id: 'new-image' }),
      isCurrent: () => true,
    });
    expect(await old).toEqual({ status: 'stale' });
    expect(await next).toMatchObject({ status: 'ready', image: { id: 'new-image' } });
    expect(releaseMaterialAsset).toHaveBeenCalledTimes(2);
  });

  it('supports retrying after a failed decode', async () => {
    const decoder = vi.fn()
      .mockRejectedValueOnce(new Error('first decode failed'))
      .mockResolvedValueOnce({ id: 'retry-image' });
    createMaterialAsset.mockResolvedValue(fakeAsset('blob:retry'));
    expect((await loadWatermarkPreview({ path: '/tmp/retry.png', fromUrl: decoder, isCurrent: () => true })).status).toBe('error');
    expect(await loadWatermarkPreview({ path: '/tmp/retry.png', fromUrl: decoder, isCurrent: () => true })).toMatchObject({ status: 'ready', image: { id: 'retry-image' } });
  });

  it('lets a video selection replace an old image preview with a notice, not a retryable decoder error', () => {
    const state = { background: 'old-image', notice: '', error: '' };
    const next = classifyWatermarkPreview('/tmp/中文 空格/clip.mp4');
    if (next === 'video') {
      state.background = '';
      state.notice = '视频素材不会在水印画布中生成静态预览；可继续加入批处理队列。';
      state.error = '';
    }
    expect(state.background).toBe('');
    expect(state.notice).toContain('不会在水印画布中生成静态预览');
    expect(state.error).toBe('');
  });

  it('allows an overlay retry success to clear only the overlay error', () => {
    const state = { backgroundError: '原图加载失败', overlayError: '水印图片加载失败' };
    state.overlayError = '';
    expect(state.backgroundError).toBe('原图加载失败');
    expect(state.overlayError).toBe('');
  });

  it('releases a ready asset exactly once', async () => {
    createMaterialAsset.mockResolvedValue(fakeAsset('blob:ready'));
    const result = await loadWatermarkPreview({
      path: '/tmp/ready.png',
      fromUrl: async () => ({ id: 'image' }),
      isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'ready' });
    expect(releaseMaterialAsset).toHaveBeenCalledTimes(1);
    expect(releaseMaterialAsset).toHaveBeenCalledWith(expect.objectContaining({ objectUrl: 'blob:ready' }));
  });

  it('releases a stale asset exactly once', async () => {
    createMaterialAsset.mockResolvedValue(fakeAsset('blob:stale'));
    const result = await loadWatermarkPreview({
      path: '/tmp/stale.png',
      fromUrl: vi.fn(),
      isCurrent: () => false,
    });
    expect(result).toEqual({ status: 'stale' });
    expect(releaseMaterialAsset).toHaveBeenCalledTimes(1);
  });

  it('releases after the decoder throws or returns no image', async () => {
    createMaterialAsset.mockResolvedValue(fakeAsset('blob:throw'));
    const thrown = await loadWatermarkPreview({
      path: '/tmp/throw.png',
      fromUrl: async () => { throw new Error('decode failed'); },
      isCurrent: () => true,
    });
    expect(thrown).toMatchObject({ status: 'error' });
    expect(releaseMaterialAsset).toHaveBeenCalledTimes(1);

    createMaterialAsset.mockResolvedValue(fakeAsset('blob:empty'));
    const empty = await loadWatermarkPreview({
      path: '/tmp/empty.png',
      fromUrl: async () => null,
      isCurrent: () => true,
    });
    expect(empty).toMatchObject({ status: 'error' });
    expect(releaseMaterialAsset).toHaveBeenCalledTimes(2);
  });

  it('does not let release failures replace ready or decoder errors', async () => {
    releaseMaterialAsset.mockImplementation(() => { throw new Error('release failed'); });
    createMaterialAsset.mockResolvedValue(fakeAsset('blob:ready'));
    const ready = await loadWatermarkPreview({
      path: '/tmp/ready.png',
      fromUrl: async () => ({ id: 'image' }),
      isCurrent: () => true,
    });
    expect(ready).toMatchObject({ status: 'ready', image: { id: 'image' } });

    createMaterialAsset.mockResolvedValue(fakeAsset('blob:error'));
    const error = await loadWatermarkPreview({
      path: '/tmp/error.png',
      fromUrl: async () => { throw new Error('decode failed'); },
      isCurrent: () => true,
    });
    expect(error).toMatchObject({ status: 'error', error: expect.objectContaining({ message: 'decode failed' }) });
  });
});
