import { describe, expect, it, vi } from 'vitest';
import { classifyWatermarkPreview, loadWatermarkPreview } from './watermarkPreview';

describe('watermark preview adapter', () => {
  it('does not send MP4/MOV through an image decoder', () => {
    expect(classifyWatermarkPreview('/tmp/中文 空格/样例.mp4')).toBe('video');
    expect(classifyWatermarkPreview('clip.MOV')).toBe('video');
    expect(classifyWatermarkPreview('封面 图片.png')).toBe('image');
  });

  it('leaves loading when local preview source creation fails', async () => {
    const result = await loadWatermarkPreview({
      path: '/tmp/图片.png',
      createSource: async () => { throw new Error('local preview unavailable'); },
      fromUrl: vi.fn(),
      isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'error' });
  });

  it('returns a visible decoder failure instead of a second verifier result', async () => {
    const result = await loadWatermarkPreview({
      path: '/tmp/图片.png',
      createSource: async () => ({ url: 'blob:preview', release: vi.fn() }),
      fromUrl: async () => { throw new Error('network error'); },
      isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'error' });
  });

  it('drops an old late failure so it cannot overwrite a newer success', async () => {
    let current = false;
    const old = loadWatermarkPreview({
      path: '/tmp/old.png',
      createSource: async () => ({ url: 'blob:old', release: vi.fn() }),
      fromUrl: async () => { current = false; throw new Error('late failure'); },
      isCurrent: () => current,
    });
    const next = loadWatermarkPreview({
      path: '/tmp/new.png',
      createSource: async () => ({ url: 'blob:new', release: vi.fn() }),
      fromUrl: async () => ({ id: 'new-image' }),
      isCurrent: () => true,
    });
    expect(await old).toEqual({ status: 'stale' });
    expect(await next).toMatchObject({ status: 'ready', image: { id: 'new-image' } });
  });

  it('supports retrying after a failed decode', async () => {
    const decoder = vi.fn()
      .mockRejectedValueOnce(new Error('first decode failed'))
      .mockResolvedValueOnce({ id: 'retry-image' });
    const options = {
      path: '/tmp/retry.png', createSource: async () => ({ url: 'blob:retry', release: vi.fn() }), fromUrl: decoder, isCurrent: () => true,
    };
    expect((await loadWatermarkPreview(options)).status).toBe('error');
    expect(await loadWatermarkPreview(options)).toMatchObject({ status: 'ready', image: { id: 'retry-image' } });
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

  it('releases a ready source exactly once', async () => {
    const release = vi.fn();
    const result = await loadWatermarkPreview({
      path: '/tmp/ready.png', createSource: async () => ({ url: 'blob:ready', release }),
      fromUrl: async () => ({ id: 'image' }), isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'ready' });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases a stale source exactly once', async () => {
    const release = vi.fn();
    const result = await loadWatermarkPreview({
      path: '/tmp/stale.png', createSource: async () => ({ url: 'blob:stale', release }),
      fromUrl: vi.fn(), isCurrent: () => false,
    });
    expect(result).toEqual({ status: 'stale' });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases after decoder throws or returns no image', async () => {
    const thrownRelease = vi.fn();
    const thrown = await loadWatermarkPreview({
      path: '/tmp/throw.png', createSource: async () => ({ url: 'blob:throw', release: thrownRelease }),
      fromUrl: async () => { throw new Error('decode failed'); }, isCurrent: () => true,
    });
    expect(thrown).toMatchObject({ status: 'error' });
    expect(thrownRelease).toHaveBeenCalledTimes(1);

    const emptyRelease = vi.fn();
    const empty = await loadWatermarkPreview({
      path: '/tmp/empty.png', createSource: async () => ({ url: 'blob:empty', release: emptyRelease }),
      fromUrl: async () => null, isCurrent: () => true,
    });
    expect(empty).toMatchObject({ status: 'error' });
    expect(emptyRelease).toHaveBeenCalledTimes(1);
  });

  it('does not let release failures replace ready or decoder errors', async () => {
    const ready = await loadWatermarkPreview({
      path: '/tmp/ready.png', createSource: async () => ({ url: 'blob:ready', release: () => { throw new Error('release failed'); } }),
      fromUrl: async () => ({ id: 'image' }), isCurrent: () => true,
    });
    expect(ready).toMatchObject({ status: 'ready', image: { id: 'image' } });

    const error = await loadWatermarkPreview({
      path: '/tmp/error.png', createSource: async () => ({ url: 'blob:error', release: () => { throw new Error('release failed'); } }),
      fromUrl: async () => { throw new Error('decode failed'); }, isCurrent: () => true,
    });
    expect(error).toMatchObject({ status: 'error', error: expect.objectContaining({ message: 'decode failed' }) });
  });
});
