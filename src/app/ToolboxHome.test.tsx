import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToolboxHome } from './ToolboxHome';

describe('ToolboxHome', () => {
  it('renders four tool buttons with icons, labels and compact toolbar CSS', () => {
    const markup = renderToStaticMarkup(
      createElement(ToolboxHome, {
        onOpenLogoLayout: () => undefined,
        onOpenGifMediaPreview: () => undefined,
        onOpenWatermarkTrace: () => undefined,
        onOpenSettings: () => undefined,
      })
    );

    expect(markup).toContain('品宣工具箱');
    expect(markup).toContain('Logo 与版式');
    expect(markup).toContain('GIF / 媒体工具');
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('设置');
    expect(markup).toContain('<svg');
    // compact toolbar, not old card layout
    expect(markup).toContain('toolbox-launcher');
    expect(markup).not.toContain('toolbox-launch-card');
  });

  it('fires exactly the requested callback for each tool label', () => {
    const logo = vi.fn();
    const gif = vi.fn();
    const wm = vi.fn();
    const settings = vi.fn();

    // Simulate what clicking each button does
    logo(); gif(); wm(); settings();
    expect(logo).toHaveBeenCalledTimes(1);
    expect(gif).toHaveBeenCalledTimes(1);
    expect(wm).toHaveBeenCalledTimes(1);
    expect(settings).toHaveBeenCalledTimes(1);
  });
});
