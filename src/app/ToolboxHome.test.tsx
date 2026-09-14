// @vitest-environment jsdom
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ToolboxHome } from './ToolboxHome';

const baseProps = {
  onOpenLogoLayout: () => undefined,
  onOpenCustom: () => undefined,
  onOpenWatermark: () => undefined,
  onOpenVideoWatermark: () => undefined,
  onOpenSettings: () => undefined,
};

function mount(props: typeof baseProps & { isDesktop?: boolean } = baseProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(createElement(ToolboxHome, props)); });
  return { container, root };
}

describe('ToolboxHome', () => {
  it('renders the enabled workflow cards and a separate settings action', () => {
    const { container, root } = mount();

    expect(container.querySelector('main[aria-label="品宣工具箱"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Logo 与版式"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="自定义构图"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="水印工具"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="视频水印"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="暗水印与像素指纹（实验）"]')).toBeNull();
    expect(container.querySelector('button[aria-label="GIF 压缩"]')).toBeNull();
    expect(container.querySelector('button[aria-label="轻量 GIF 工具"]')).toBeNull();
    expect(container.querySelector('button[aria-label="设置"]')).not.toBeNull();
    expect(container.querySelector('.toolbox-launcher')).not.toBeNull();
    expect(container.querySelectorAll('.toolbox-section-heading')).toHaveLength(1);
    expect(container.querySelector('.toolbox-tool-description')).not.toBeNull();
    expect(container.querySelector('.toolbox-trust-note')?.textContent).toContain('素材仅在本机处理');
    act(() => root.unmount());
    container.remove();
  });

  it('marks browser-only features as local and tells media users to use the desktop client', () => {
    const { container, root } = mount();

    expect(container.querySelector('.toolbox-home-footer')).toBeNull();
    expect(container.querySelector('[role="note"]')?.textContent).toContain('视频 / GIF 处理仅支持桌面版');
    act(() => root.unmount());
    container.remove();
  });

  it('gives available tools restrained identity tones without showing planned tools', () => {
    const { container, root } = mount();

    expect(container.querySelector('button[aria-label="Logo 与版式"]')?.getAttribute('data-tone')).toBe('logo');
    expect(container.querySelector('button[aria-label="自定义构图"]')?.getAttribute('data-tone')).toBe('custom');
    expect(container.querySelector('button[aria-label="水印工具"]')?.getAttribute('data-tone')).toBe('watermark');
    expect(container.querySelector('button[aria-label="视频水印"]')?.getAttribute('data-tone')).toBe('video');
    act(() => root.unmount());
    container.remove();
  });

  it('tracks pointer position on enabled cards and ignores disabled cards', () => {
    const { container, root } = mount();

    const logo = container.querySelector<HTMLButtonElement>('button[aria-label="Logo 与版式"]')!;
    logo.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 30 }));
    expect(logo.style.getPropertyValue('--pointer-x')).toBe('60px');
    expect(logo.style.getPropertyValue('--pointer-y')).toBe('30px');

    act(() => root.unmount());
    container.remove();
  });

  it('keeps the desktop trust note and drops the desktop-only notice when running in Tauri', () => {
    const { container, root } = mount({ ...baseProps, isDesktop: true });

    expect(container.querySelector('[role="note"]')).toBeNull();
    expect(container.querySelector('.toolbox-home-footer')).toBeNull();
    expect(container.querySelector('.toolbox-trust-note')?.textContent).toContain('素材仅在本机处理');
    act(() => root.unmount());
    container.remove();
  });

  it('opens the shared watermark workbench video mode from the video card', () => {
    const onOpenVideoWatermark = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<ToolboxHome {...baseProps} onOpenVideoWatermark={onOpenVideoWatermark} isDesktop />); });
    const videoCard = container.querySelector<HTMLButtonElement>('button[aria-label="视频水印"]');
    expect(videoCard?.disabled).toBe(false);
    act(() => { videoCard?.click(); });
    expect(onOpenVideoWatermark).toHaveBeenCalledTimes(1);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('opens the custom composition workspace from its own production card', () => {
    const onOpenCustom = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<ToolboxHome {...baseProps} onOpenCustom={onOpenCustom} />); });

    const customCard = container.querySelector<HTMLButtonElement>('button[aria-label="自定义构图"]');
    expect(customCard?.disabled).toBe(false);
    act(() => { customCard?.click(); });
    expect(onOpenCustom).toHaveBeenCalledTimes(1);

    act(() => { root.unmount(); });
    container.remove();
  });
});
