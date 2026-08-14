// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App root integration', () => {
  it('opens on the toolbox without exposing a blank unfinished module', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<App />); });

    const toolbox = container.querySelector<HTMLElement>('main[aria-label="品宣工具箱"]');
    expect(toolbox).not.toBeNull();
    expect(toolbox?.querySelector('button[aria-label="Logo 与版式"]')).not.toBeNull();
    expect(toolbox?.querySelector('button[aria-label="水印工具"]')).not.toBeNull();
    expect(toolbox?.querySelector('button[aria-label="视频水印"]')).not.toBeNull();
    expect(toolbox?.querySelector('button[aria-label="暗水印与像素指纹（实验）"]')).toBeNull();
    expect(toolbox?.querySelectorAll('button:disabled')).toHaveLength(0);
    expect(toolbox?.querySelector('button[aria-label="GIF 合成与压缩"]')).toBeNull();
    expect(toolbox?.querySelector('button[aria-label="批量模板 GIF 合成器"]')).toBeNull();
    expect(container.querySelector('[aria-labelledby="application-settings-title"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
