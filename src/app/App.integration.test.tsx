import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App root integration', () => {
  it('keeps global settings reachable from the root shell while media owns only its workspace', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="工作台模块"');
    expect(markup).toContain('class="settings-button"');
    expect(markup).toContain('aria-label="自定义"');
    expect(markup).toContain('aria-label="GIF 压缩"');
    expect(markup).not.toContain('brand-settings-title');
  });
});
