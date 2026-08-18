// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToolPageHeader } from './ToolPageHeader';

describe('ToolPageHeader', () => {
  it('can render a formal page header without a duplicate toolbox return control', () => {
    const html = renderToStaticMarkup(
      <ToolPageHeader
        title="水印工具"
        description="设置文字或 Logo 水印参数。"
        status="available"
        onReturn={vi.fn()}
        showReturn={false}
      />
    );

    expect(html).toContain('水印工具');
    expect(html).toContain('可用');
    expect(html).not.toContain('返回工具箱');
    expect(html).not.toContain('capsule-back-button');
  });

  it('renders the supplied formal page icon in the shared header slot', () => {
    const html = renderToStaticMarkup(
      <ToolPageHeader
        title="视频水印"
        description="视频预览。"
        status="available"
        icon={<span data-testid="page-icon">icon</span>}
        onReturn={vi.fn()}
        showReturn={false}
      />
    );

    expect(html).toContain('tool-page-icon');
    expect(html).toContain('data-testid="page-icon"');
  });
});
