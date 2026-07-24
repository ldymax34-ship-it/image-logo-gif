import { describe, expect, it, vi } from 'vitest';
import { returnToToolbox, closeGifMediaPreview } from './gifMediaLauncher';

describe('GIF media preview launcher', () => {
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
