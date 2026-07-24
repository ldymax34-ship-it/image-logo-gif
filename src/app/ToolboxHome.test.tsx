import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToolboxHome } from './ToolboxHome';

describe('ToolboxHome', () => {
  it('renders four compact tool buttons with icons and labels', () => {
    const markup = renderToStaticMarkup(
      <ToolboxHome onOpenLogoLayout={() => undefined} onOpenGifMediaPreview={() => undefined} onOpenWatermarkTrace={() => undefined} onOpenSettings={() => undefined} />
    );

    expect(markup).toContain('品宣工具箱');
    expect(markup).toContain('Logo 与版式');
    expect(markup).toContain('GIF / 媒体工具');
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('设置');
    // lucide icons render as SVG
    expect(markup).toContain('<svg');
  });

  it('fires each action callback', () => {
    const logo = vi.fn();
    const gif = vi.fn();
    const wm = vi.fn();
    const settings = vi.fn();
    const markup = renderToStaticMarkup(
      <ToolboxHome onOpenLogoLayout={logo} onOpenGifMediaPreview={gif} onOpenWatermarkTrace={wm} onOpenSettings={settings} />
    );

    expect(markup).toContain('Logo 与版式');
    expect(markup).toContain('GIF / 媒体工具');
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('设置');
  });
});
