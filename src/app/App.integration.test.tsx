import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App root integration', () => {
  it('opens on the toolbox without exposing a blank unfinished module', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('品宣工具箱');
    expect(markup).toContain('Logo 与版式');
    expect(markup).toContain('GIF 合成与压缩');
    expect(markup).toContain('水印与追溯');
    expect(markup).toContain('aria-label="工作台模块"');
    expect(markup).not.toContain('brand-settings-title');
  });
});
