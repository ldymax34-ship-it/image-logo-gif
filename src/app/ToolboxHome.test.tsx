import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToolboxHome } from './ToolboxHome';

describe('ToolboxHome', () => {
  it('keeps the available Logo workspace and Settings separate from unavailable tools', () => {
    const markup = renderToStaticMarkup(
      <ToolboxHome onOpenLogoLayout={() => undefined} onOpenSettings={() => undefined} />
    );

    expect(markup).toContain('品宣工具箱');
    expect(markup).toContain('Logo 与版式');
    expect(markup).toContain('GIF / 媒体工具');
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('设置');
    expect(markup).toContain('即将开放');
    expect(markup).toMatch(/Logo 与版式[\s\S]*?进入工作台/);
    expect(markup).toContain('disabled=""');
  });
});
