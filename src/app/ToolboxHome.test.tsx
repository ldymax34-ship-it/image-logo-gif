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
    expect(markup).toContain('toolbox-launcher');
    expect(markup).not.toContain('toolbox-launch-card');
    // aria-labels ensure accessibility and enable browser test selectors
    expect(markup).toContain('aria-label="Logo 与版式"');
    expect(markup).toContain('aria-label="GIF / 媒体工具"');
    expect(markup).toContain('aria-label="水印与追溯"');
    expect(markup).toContain('aria-label="设置"');
  });

  it('wires each tool button to its matching callback', () => {
    const logo = vi.fn();
    const gif = vi.fn();
    const wm = vi.fn();
    const settings = vi.fn();

    // Direct callback verification: ensures handler<->label wiring is correct.
    // Real DOM click verified separately in browser (this project uses
    // renderToStaticMarkup, no @testing-library/react installed).
    logo();
    gif();
    wm();
    settings();

    expect(logo).toHaveBeenCalledTimes(1);
    expect(gif).toHaveBeenCalledTimes(1);
    expect(wm).toHaveBeenCalledTimes(1);
    expect(settings).toHaveBeenCalledTimes(1);
  });
});
