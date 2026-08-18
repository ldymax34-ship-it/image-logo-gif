import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('describes the affected and unaffected content for scoped changes', () => {
    const html = renderToStaticMarkup(
      <ConfirmationDialog
        title="同步 Logo 到同尺寸画板"
        message="将覆盖 2 个目标画板中已有的 Logo 设置。"
        details={['目标：其他素材中的 1920 × 1080 画板', '同步：位置、大小、高级效果', '不影响：图片裁切、CPR']}
        confirmLabel="确认同步 2 个画板"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(html).toContain('其他素材中的 1920 × 1080 画板');
    expect(html).toContain('不影响：图片裁切、CPR');
    expect(html).toContain('aria-describedby="confirm-dialog-message confirm-dialog-details"');
  });

  it('supports explicit continue, save-and-switch and discard-and-switch actions', () => {
    const html = renderToStaticMarkup(
      <ConfirmationDialog
        title="放弃当前工作？"
        message="未导出的内容可能丢失。"
        details={["部分设置仅临时保存在本机。"]}
        cancelLabel="继续编辑"
        secondaryLabel="保存并切换"
        confirmLabel="放弃并切换"
        destructive
        onCancel={vi.fn()}
        onSecondary={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(html).toContain('继续编辑');
    expect(html).toContain('保存并切换');
    expect(html).toContain('放弃并切换');
    expect(html).toContain('部分设置仅临时保存在本机');
  });
});
