import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToolboxHome, getToolboxLaunchAction } from './ToolboxHome';

describe('ToolboxHome', () => {
  it('keeps the available Logo workspace and Settings separate from unavailable tools', () => {
    const markup = renderToStaticMarkup(
      <ToolboxHome onOpenLogoLayout={() => undefined} onOpenGifMediaPreview={() => undefined} onOpenWatermarkTrace={() => undefined} onOpenSettings={() => undefined} />
    );

    expect(markup).toContain('品宣工具箱');
    expect(markup).toContain('Logo 与版式');
    expect(markup).toContain('GIF / 媒体工具');
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('设置');
    expect(markup).toContain('内部实验');
    expect(markup).toContain('打开 GIF 工具');
    expect(markup).toMatch(/Logo 与版式[\s\S]*?进入工作台/);
    expect(markup).toContain('打开水印工具');
  });

  it('routes the clickable GIF card to the isolated media preview launcher', () => {
    let opened = 0;
    const action = getToolboxLaunchAction('gif-media', {
      onOpenLogoLayout: () => undefined,
      onOpenGifMediaPreview: () => { opened += 1; },
      onOpenWatermarkTrace: () => undefined
    });

    action?.();
    expect(opened).toBe(1);
  });
});
