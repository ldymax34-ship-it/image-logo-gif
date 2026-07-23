import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApplicationSettingsDialog } from './ApplicationSettingsDialog';

describe('ApplicationSettingsDialog', () => {
  it('keeps every startup choice in the application-level preference surface', () => {
    const markup = renderToStaticMarkup(
      <ApplicationSettingsDialog
        preferences={{ version: 1, startupTool: 'toolbox', lastTool: 'toolbox' }}
        onPreferencesChange={() => undefined}
        onClose={() => undefined}
      />
    );

    expect(markup).toContain('启动时打开');
    expect(markup).toContain('工具箱首页');
    expect(markup).toContain('Logo 与版式');
    expect(markup).toContain('GIF / 媒体工具');
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('上次使用的工具');
    expect(markup).toContain('GIF / 媒体工具会在启动后打开独立窗口');
    expect(markup).toContain('水印与追溯仍会安全回退到工具箱首页');
  });
});
