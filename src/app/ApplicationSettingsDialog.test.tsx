// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ApplicationSettingsDialog } from './ApplicationSettingsDialog';

const preferences = { version: 1, startupTool: 'toolbox', lastTool: 'toolbox' } as const;

function mount(props: React.ComponentProps<typeof ApplicationSettingsDialog>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<ApplicationSettingsDialog {...props} />); });
  return { container, root };
}

describe('ApplicationSettingsDialog', () => {
  it('hides the desktop-only GIF media startup choice in the browser', () => {
    const { container, root } = mount({ preferences, onPreferencesChange: () => undefined, onClose: () => undefined });
    const select = container.querySelector<HTMLSelectElement>('select')!;
    const values = [...select.options].map((option) => option.value);

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('启动时打开');
    expect(values).toEqual(['toolbox', 'logo-layout', 'watermark', 'video-watermark', 'last']);
    expect(container.textContent).not.toContain('GIF / 媒体工具会在启动后打开独立窗口');
    act(() => root.unmount());
    container.remove();
  });

  it('does not leave a dangling gif-media select value in the browser when the stored preference is desktop-only', () => {
    const { container, root } = mount({ preferences: { version: 1, startupTool: 'gif-media', lastTool: 'toolbox' }, onPreferencesChange: () => undefined, onClose: () => undefined });
    const select = container.querySelector<HTMLSelectElement>('select')!;

    expect(select.value).toBe('toolbox');
    expect([...select.options].some((option) => option.value === 'gif-media')).toBe(false);
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the full startup choice list when running in Tauri', () => {
    const { container, root } = mount({ preferences, onPreferencesChange: () => undefined, onClose: () => undefined, isDesktop: true });
    const select = container.querySelector<HTMLSelectElement>('select')!;

    expect([...select.options].map((option) => option.value)).toEqual(['toolbox', 'logo-layout', 'gif-media', 'watermark', 'video-watermark', 'last']);
    expect(container.textContent).toContain('水印工具会直接打开水印工作台');
    act(() => root.unmount());
    container.remove();
  });
});
