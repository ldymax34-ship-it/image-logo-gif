import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToolboxHome } from './ToolboxHome';

describe('ToolboxHome', () => {
  it('renders four workflow cards and a separate settings action', () => {
    const markup = renderToStaticMarkup(
      createElement(ToolboxHome, {
        onOpenLogoLayout: () => undefined,
        onOpenGifCompress: () => undefined,
        onOpenBatchTemplateGif: () => undefined,
        onOpenWatermarkTrace: () => undefined,
        onOpenSettings: () => undefined,
      })
    );

    expect(markup).toContain('品宣工具箱');
    expect(markup).toContain('Logo 与版式');
    expect(markup).toContain('GIF 合成与压缩');
    expect(markup).toContain('批量模板 GIF 合成器');
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('设置');
    expect(markup).toContain('素材仅在本机处理');
    expect(markup).toContain('<svg');
    expect(markup).toContain('toolbox-launcher');
    expect(markup).toContain('toolbox-tool-description');
    expect(markup).toContain('aria-label="Logo 与版式"');
    expect(markup).toContain('aria-label="GIF 合成与压缩"');
    expect(markup).toContain('aria-label="批量模板 GIF 合成器"');
    expect(markup).toContain('aria-label="水印与追溯"');
    expect(markup).toContain('aria-label="设置"');
  });
});
