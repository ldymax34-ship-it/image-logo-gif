// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
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
  it('exposes the watermark tool as a startup choice', () => {
    const { container, root } = mount({ preferences, onPreferencesChange: () => undefined, onClose: () => undefined });
    const select = container.querySelector<HTMLSelectElement>('select')!;
    expect([...select.options].map((option) => option.value)).toContain('watermark');
    expect([...select.options].some((option) => option.textContent === '水印与追溯')).toBe(false);
    act(() => root.unmount());
    container.remove();
  });

  it('updates the startup preference through the real select control', () => {
    const onPreferencesChange = vi.fn();
    const { container, root } = mount({ preferences, onPreferencesChange, onClose: () => undefined });
    const select = container.querySelector<HTMLSelectElement>('select')!;
    act(() => {
      select.value = 'watermark';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onPreferencesChange).toHaveBeenCalledWith({ ...preferences, startupTool: 'watermark' });
    act(() => root.unmount());
    container.remove();
  });

  it('closes from Escape through the mounted dialog listener', () => {
    const onClose = vi.fn();
    const { container, root } = mount({ preferences, onPreferencesChange: () => undefined, onClose });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });
});
