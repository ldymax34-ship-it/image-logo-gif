// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { exportStatusStore } from '../components/export-status/exportStatusStore';

describe('App root integration', () => {
  beforeEach(() => {
    exportStatusStore.resetForTests();
  });

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
    expect(toolbox?.querySelector('button[aria-label="GIF 压缩"]')).toBeNull();
    expect(toolbox?.querySelector('button[aria-label="轻量 GIF 工具"]')).toBeNull();
    // The homepage now exposes the shipped single-video GIF entry; the old
    // placeholder labels and the unavailable template tool stay absent.
    expect(toolbox?.querySelector('button[aria-label="视频转 GIF"]')).not.toBeNull();
    expect(toolbox?.querySelector('button[aria-label="GIF 合成与压缩"]')).toBeNull();
    expect(toolbox?.querySelector('button[aria-label="批量模板 GIF 合成器"]')).toBeNull();
    expect(container.querySelector('[aria-labelledby="application-settings-title"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('keeps the video workspace mounted after returning so queue listeners can continue updating', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<App />); });

    const videoCard = container.querySelector<HTMLButtonElement>('button[aria-label="视频水印"]')!;
    act(() => { videoCard.click(); });
    const videoHeading = [...container.querySelectorAll('h1')]
      .find((heading) => heading.textContent === '视频水印')!;
    expect(videoHeading).toBeDefined();

    const toolboxButton = container.querySelector<HTMLButtonElement>('aside button[aria-label="工具箱首页"]')!;
    act(() => { toolboxButton.click(); });

    expect(container.querySelector('main[aria-label="品宣工具箱"]')).not.toBeNull();
    const retainedHeading = [...container.querySelectorAll('h1')]
      .find((heading) => heading.textContent === '视频水印');
    expect(retainedHeading?.closest('div[hidden]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('opens 自定义构图 from its own entry with a full-height empty workspace', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<App />); });

    const customEntry = container.querySelector<HTMLButtonElement>('aside button[aria-label="自定义构图"]')!;
    act(() => { customEntry.click(); });

    const customWorkspace = container.querySelector<HTMLElement>('.custom-workspace');
    expect(customWorkspace).not.toBeNull();
    expect(container.querySelector('.custom-empty')?.textContent).toContain('未导入图片');
    expect([...container.querySelectorAll('h1')].some((heading) => heading.textContent === '自定义构图')).toBe(true);
    // 独立入口之后，页面内不再重复一套 设媒 / 自定义 模块导航。
    expect(container.querySelector('.module-nav')).toBeNull();
    expect(container.querySelector('.app-module-content-custom')).not.toBeNull();

    const logoEntry = container.querySelector<HTMLButtonElement>('aside button[aria-label="Logo 与版式"]')!;
    act(() => { logoEntry.click(); });
    expect(container.querySelector('.custom-workspace')).toBeNull();
    expect(container.querySelector('.app-module-content-media .workspace')).not.toBeNull();
    expect([...container.querySelectorAll('h1')].some((heading) => heading.textContent === 'Logo 与版式')).toBe(true);

    act(() => root.unmount());
    container.remove();
  });

  it('hides video tasks from the global panel only while the video tool is active', () => {
    exportStatusStore.upsert({ id: 'v1', batchId: 'video-b', source: 'video-watermark', name: '片段', extension: 'mp4', progress: 0, status: 'queued' });
    exportStatusStore.upsert({ id: 'm1', batchId: 'media-b', source: 'media-batch', name: '封面', extension: 'jpg', progress: 0, status: 'queued' });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<App />); });

    // On the toolbox the panel shows tasks from every module.
    expect(container.textContent).toContain('封面.jpg');
    expect(container.textContent).toContain('片段.mp4');

    const videoCard = container.querySelector<HTMLButtonElement>('button[aria-label="视频水印"]')!;
    act(() => { videoCard.click(); });

    // While the video tool is active its own tasks are hidden but other modules remain.
    expect(container.textContent).toContain('封面.jpg');
    expect(container.textContent).not.toContain('片段.mp4');

    const videoHeading = [...container.querySelectorAll('h1')]
      .find((heading) => heading.textContent === '视频水印')!;
    const toolboxButton = container.querySelector<HTMLButtonElement>('aside button[aria-label="工具箱首页"]')!;
    act(() => { toolboxButton.click(); });

    // Back on the toolbox the video tasks are visible again.
    expect(container.textContent).toContain('片段.mp4');

    act(() => root.unmount());
    container.remove();
  });

  it('opens 视频转 GIF from the homepage card into the single-video Vue tool', async () => {
    // Warm the dynamic import first so mounting does not depend on module-graph
    // transform timing while the whole suite is running.
    await import('../gif-tool/main');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<App />); });

    const gifCard = container.querySelector<HTMLButtonElement>('main[aria-label="品宣工具箱"] button[aria-label="视频转 GIF"]')!;
    expect(gifCard).not.toBeUndefined();
    await act(async () => { gifCard.click(); });

    // The page header states the shipped scope and the decimal 8 MB ceiling.
    expect([...container.querySelectorAll('h1')].some((heading) => heading.textContent === '视频转 GIF')).toBe(true);
    expect(container.querySelector('.embedded-tool-wrapper')).not.toBeNull();
    expect(container.textContent).toContain('不超过 8 MB');

    // The Vue module mounts into the wrapper without a separate window.
    const vueRoot = container.querySelector('.embedded-tool-container');
    expect(vueRoot).not.toBeNull();
    await vi.waitFor(() => {
      expect(vueRoot?.querySelector('main[aria-label="视频转 GIF"]')).not.toBeNull();
    }, { timeout: 10_000, interval: 25 });
    expect(vueRoot?.querySelector('.gif-tool')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
