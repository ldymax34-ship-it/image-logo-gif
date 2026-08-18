// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
