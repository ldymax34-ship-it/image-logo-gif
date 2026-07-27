import { describe, expect, it, vi } from 'vitest';
import { classifyWatermarkPreview, loadWatermarkPreview } from './watermarkPreview';

describe('watermark preview adapter', () => {
  it('does not send MP4/MOV through an image decoder', () => {
    expect(classifyWatermarkPreview('/tmp/中文 空格/样例.mp4')).toBe('video');
    expect(classifyWatermarkPreview('clip.MOV')).toBe('video');
    expect(classifyWatermarkPreview('封面 图片.png')).toBe('image');
  });

  it('leaves loading when asset URL construction fails', async () => {
    const result = await loadWatermarkPreview({
      path: '/tmp/图片.png',
      toAssetUrl: () => { throw new Error('asset protocol unavailable'); },
      fromUrl: vi.fn(),
      isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'error' });
  });

  it('returns a visible decoder failure instead of a second verifier result', async () => {
    const result = await loadWatermarkPreview({
      path: '/tmp/图片.png',
      toAssetUrl: () => 'asset://localhost/图片.png',
      fromUrl: async () => { throw new Error('network error'); },
      isCurrent: () => true,
    });
    expect(result).toMatchObject({ status: 'error' });
  });

  it('drops an old late failure so it cannot overwrite a newer success', async () => {
    let current = false;
    const old = loadWatermarkPreview({
      path: '/tmp/old.png',
      toAssetUrl: () => 'asset://localhost/old.png',
      fromUrl: async () => { current = false; throw new Error('late failure'); },
      isCurrent: () => current,
    });
    const next = loadWatermarkPreview({
      path: '/tmp/new.png',
      toAssetUrl: () => 'asset://localhost/new.png',
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
      path: '/tmp/retry.png', toAssetUrl: () => 'asset://localhost/retry.png', fromUrl: decoder, isCurrent: () => true,
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
});
