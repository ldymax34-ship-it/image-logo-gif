import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import GifMediaPreview from './GifMediaPreview.vue';

describe('GifMediaPreview', () => {
  it('renders the isolated preview with disabled execution and no fake result state', async () => {
    const markup = await renderToString(createSSRApp(GifMediaPreview));

    expect(markup).toContain('GIF / 媒体工具');
    expect(markup).toContain('实验预览');
    expect(markup).toContain('拖入 MP4、MOV 或 GIF');
    expect(markup).toContain('高清');
    expect(markup).toContain('8MB 倾向');
    expect(markup).toContain('快速预览');
    expect(markup).toContain('原尺寸');
    expect(markup).toContain('等待');
    expect(markup).toContain('运行');
    expect(markup).toContain('成功');
    expect(markup).toContain('失败');
    expect(markup).toContain('取消');
    expect(markup).toContain('转换引擎尚未接入');
    expect(markup).toContain('开始处理');
    expect(markup).toMatch(/开始处理<\/button>/);
    expect(markup).toContain('disabled');
    expect(markup).toContain('返回工具箱');
    expect(markup).not.toContain('处理完成');
  });
});
