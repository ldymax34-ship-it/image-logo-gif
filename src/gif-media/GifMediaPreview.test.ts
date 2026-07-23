import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import GifMediaPreview from './GifMediaPreview.vue';

describe('GifMediaPreview', () => {
  it('keeps browser mode visibly desktop-only and never fabricates a task result', async () => {
    const markup = await renderToString(createSSRApp(GifMediaPreview));

    expect(markup).toContain('GIF / 媒体工具');
    expect(markup).toContain('实验功能');
    expect(markup).toContain('拖入 MP4 或 MOV');
    expect(markup).toContain('高清');
    expect(markup).toContain('8MB 倾向');
    expect(markup).toContain('快速预览');
    expect(markup).toContain('原尺寸');
    expect(markup).toContain('等待');
    expect(markup).toContain('运行');
    expect(markup).toContain('成功');
    expect(markup).toContain('失败');
    expect(markup).toContain('取消');
    expect(markup).toContain('真实转换仅桌面可用');
    expect(markup).toContain('开始处理');
    expect(markup).toMatch(/开始处理<\/button>/);
    expect(markup).toContain('disabled');
    expect(markup).toContain('返回工具箱');
    expect(markup).toContain('不覆盖输入文件；重名输出会追加');
    expect(markup).not.toContain('已完成');
  });
});
