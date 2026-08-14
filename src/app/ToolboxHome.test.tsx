// @vitest-environment jsdom
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ToolboxHome } from './ToolboxHome';

const baseProps = {
  onOpenLogoLayout: () => undefined,
  onOpenWatermark: () => undefined,
  onOpenVideoWatermark: () => undefined,
  onOpenSettings: () => undefined,
};

function mount(props: typeof baseProps = baseProps) {
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
    expect(container.querySelector('button[aria-label="水印工具"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="视频水印"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="暗水印与像素指纹（实验）"]')).toBeNull();
    expect(container.querySelectorAll('button:disabled')).toHaveLength(0);
    expect(container.querySelector('button[aria-label="设置"]')).not.toBeNull();
    expect(container.querySelector('.toolbox-launcher')).not.toBeNull();
    expect(container.querySelector('.toolbox-tool-description')).not.toBeNull();
    expect(container.querySelector('.toolbox-trust-note')?.textContent).toContain('素材仅在本机处理');
    act(() => root.unmount());
    container.remove();
  });


  it('opens the shared watermark workbench video mode from the video card', () => {
    const onOpenVideoWatermark = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<ToolboxHome {...baseProps} onOpenVideoWatermark={onOpenVideoWatermark} />); });
    const videoCard = container.querySelector<HTMLButtonElement>('button[aria-label="视频水印"]');
    expect(videoCard?.disabled).toBe(false);
    act(() => { videoCard?.click(); });
    expect(onOpenVideoWatermark).toHaveBeenCalledTimes(1);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('opens the image watermark workbench from the watermark card', () => {
    const onOpenWatermark = vi.fn();
    const { container, root } = mount({ ...baseProps, onOpenWatermark });
    const card = container.querySelector<HTMLButtonElement>('button[aria-label="水印工具"]');
    act(() => { card?.click(); });
    expect(onOpenWatermark).toHaveBeenCalledTimes(1);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('keeps the dark watermark experiment out of the visible navigation', () => {
    const { container, root } = mount();
    expect(container.querySelector('button[aria-label="暗水印与像素指纹（实验）"]')).toBeNull();
    act(() => { root.unmount(); });
    container.remove();
  });
});
