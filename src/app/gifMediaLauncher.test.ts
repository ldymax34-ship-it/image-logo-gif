import { describe, expect, it, vi } from 'vitest';
import {
  GIF_MEDIA_PAGE_PATH,
  GIF_MEDIA_WINDOW_LABEL,
  closeGifMediaPreview,
  openGifMediaDesktopWindow,
  openGifMediaPreview,
  returnToToolbox
} from './gifMediaLauncher';

describe('GIF media preview launcher', () => {
  it('navigates to the standalone page in the browser without touching app state', async () => {
    const navigate = vi.fn();
    const appState = Object.freeze({ activeTool: 'toolbox', boardCount: 2 });

    await expect(openGifMediaPreview({ isDesktop: false, navigate })).resolves.toBe('browser');
    expect(navigate).toHaveBeenCalledWith(GIF_MEDIA_PAGE_PATH);
    expect(appState).toEqual({ activeTool: 'toolbox', boardCount: 2 });
  });

  it('creates one isolated desktop window and focuses the existing singleton', async () => {
    const create = vi.fn();
    const getByLabel = vi.fn().mockResolvedValue(null);
    await expect(openGifMediaDesktopWindow({ getByLabel, create })).resolves.toBe('desktop-created');
    expect(create).toHaveBeenCalledWith(GIF_MEDIA_WINDOW_LABEL, expect.objectContaining({ url: GIF_MEDIA_PAGE_PATH }));

    const show = vi.fn().mockResolvedValue(undefined);
    const setFocus = vi.fn().mockResolvedValue(undefined);
    const emit = vi.fn().mockResolvedValue(undefined);
    await expect(openGifMediaDesktopWindow({ getByLabel: vi.fn().mockResolvedValue({ show, setFocus, emit }), create }, 'watermark')).resolves.toBe('desktop-existing');
    expect(show).toHaveBeenCalledOnce();
    expect(setFocus).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('gif-media://mode', 'watermark');
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
