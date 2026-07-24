import { describe, expect, it, vi } from 'vitest';
import {
  GIF_TOOL_PAGE_PATH,
  GIF_TOOL_WINDOW_LABEL,
  WATERMARK_TOOL_PAGE_PATH,
  WATERMARK_TOOL_WINDOW_LABEL,
  closeGifMediaPreview,
  openGifMediaDesktopWindow,
  openGifMediaPreview,
  returnToToolbox
} from './gifMediaLauncher';

describe('GIF media preview launcher', () => {
  it('navigates to the GIF tool page in browser mode', async () => {
    const navigate = vi.fn();
    await expect(openGifMediaPreview({ isDesktop: false, navigate, mode: 'gif' })).resolves.toBe('browser');
    expect(navigate).toHaveBeenCalledWith(GIF_TOOL_PAGE_PATH);
  });

  it('navigates to the watermark tool page in browser mode', async () => {
    const navigate = vi.fn();
    await expect(openGifMediaPreview({ isDesktop: false, navigate, mode: 'watermark' })).resolves.toBe('browser');
    expect(navigate).toHaveBeenCalledWith(WATERMARK_TOOL_PAGE_PATH);
  });

  it('creates one isolated GIF desktop window', async () => {
    const create = vi.fn();
    const getByLabel = vi.fn().mockResolvedValue(null);
    await expect(openGifMediaDesktopWindow({ getByLabel, create })).resolves.toBe('desktop-created');
    expect(create).toHaveBeenCalledWith(GIF_TOOL_WINDOW_LABEL, expect.objectContaining({ url: GIF_TOOL_PAGE_PATH }));
  });

  it('focuses the existing watermark window singleton', async () => {
    const show = vi.fn().mockResolvedValue(undefined);
    const setFocus = vi.fn().mockResolvedValue(undefined);
    await expect(openGifMediaDesktopWindow({ getByLabel: vi.fn().mockResolvedValue({ show, setFocus }), create: vi.fn() }, 'watermark')).resolves.toBe('desktop-existing');
    expect(show).toHaveBeenCalledOnce();
    expect(setFocus).toHaveBeenCalledOnce();
  });

  it('keeps a browser return path to the toolbox', () => {
    const navigate = vi.fn();
    returnToToolbox(navigate);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('closes the desktop preview and returns the browser fallback to the toolbox', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    await expect(closeGifMediaPreview({ isDesktop: true, desktopWindow: { close } })).resolves.toBe('desktop-closed');
    expect(close).toHaveBeenCalledOnce();

    const navigate = vi.fn();
    await expect(closeGifMediaPreview({ isDesktop: false, navigate })).resolves.toBe('browser-returned');
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
