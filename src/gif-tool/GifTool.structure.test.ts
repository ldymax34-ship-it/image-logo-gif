import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import GifTool from './GifTool.vue';

/**
 * Structure contract for the single-page GIF workspace (SSR markup only).
 *
 * The page is a fixed four-part composition: toolbar row, main preview,
 * transport strip, and a fixed-width settings panel. It must never drift back
 * into the old stacked "task cards + reference frame + import dropzone" layout.
 */
describe('GifTool workspace structure', () => {
  it('renders the one-page composition instead of stacked cards', async () => {
    const markup = await renderToString(createSSRApp(GifTool));

    expect(markup).toContain('gif-tool-toolbar');
    expect(markup).toContain('gif-workspace');
    expect(markup).toContain('gif-preview-stage');
    expect(markup).toContain('gif-transport');
    expect(markup).toMatch(/class="[^"]*gif-tool-settings/);

    // The old page appended everything vertically: task cards, a second
    // reference-frame preview, a final-preview card and an import dropzone.
    expect(markup).not.toContain('gif-tool-task');
    expect(markup).not.toContain('final-preview');
    expect(markup).not.toContain('gif-tool-layout');
    expect(markup).not.toContain('当前视频');
    expect(markup).not.toContain('已选择的视频');
    expect(markup).not.toContain('1 个视频');
    expect(markup).not.toContain('开始处理');
    expect(markup).not.toContain('拖入窗口也会加入队列');
  });

  it('offers exactly one compute button and one save button', async () => {
    const markup = await renderToString(createSSRApp(GifTool));

    const computeButtons = markup.match(/gif-transport-compute/g) ?? [];
    const saveButtons = markup.match(/gif-settings-save/g) ?? [];
    expect(computeButtons.length).toBe(1);
    expect(saveButtons.length).toBe(1);
    // The visible labels, not just class names.
    expect((markup.match(/>计算 GIF</g) ?? []).length).toBe(1);
    expect((markup.match(/>保存 GIF</g) ?? []).length).toBe(1);
  });

  it('lays out the four output intents as a 2x2 preset grid with full labels', async () => {
    const markup = await renderToString(createSSRApp(GifTool));

    expect((markup.match(/role="radiogroup"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    for (const label of ['均衡', '帧率优先', '画质优先', '自定义']) {
      const occurrences = markup.split(`>${label}<`).length - 1;
      expect(occurrences, `${label} must appear once as a preset button`).toBe(1);
    }
    // No legacy mode tab bar wording.
    expect(markup).not.toContain('模板模式');
    expect(markup).not.toContain('普通模式');
  });

  it('only exposes numeric width fields for the custom preset', async () => {
    const markup = await renderToString(createSSRApp(GifTool));

    expect(markup).toContain('尺寸自动调整，计算后查看实际结果');
    // The custom-only inputs must be absent until 自定义 is selected.
    expect(markup).not.toContain('aria-label="输出宽度"');
    expect(markup).not.toContain('aria-label="最低允许宽度"');
  });

  it('states the real product limits without promising more than it can do', async () => {
    const markup = await renderToString(createSSRApp(GifTool));

    expect(markup).toContain('8,000,000 字节');
    expect(markup).not.toContain('8 MiB');
    expect(markup).toContain('无法保证任意视频都能压到该上限');
    expect(markup).toContain('帧率是硬约束，压缩过程不会改动它');
    expect(markup).toContain('最多两次完整编码');
    expect(markup).toContain('重名自动追加序号，不覆盖已有文件');
    expect(markup).toContain('保存只复制已计算结果，不会重新编码');
    expect(markup).toContain('计算方式说明');
    expect(markup).not.toContain('最低帧率');
    expect(markup).not.toContain('允许强压缩');
  });

  it('opens with the engine unresolved rather than faking readiness', async () => {
    const markup = await renderToString(createSSRApp(GifTool));

    expect(markup).toContain('正在检查内置转换引擎');
    // Both import entry points exist (toolbar + empty state) but are disabled
    // before the desktop bridge resolves.
    expect((markup.match(/导入视频/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(markup).toContain('disabled');
  });
});
