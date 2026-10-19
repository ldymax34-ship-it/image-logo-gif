// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';

describe('AppSidebar', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts collapsed with an explicit expand action and only lists available tools', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<AppSidebar activeTool="toolbox" onNavigate={vi.fn()} onOpenSettings={vi.fn()} />));

    expect(container.querySelector('aside')?.classList.contains('is-collapsed')).toBe(true);
    expect(container.querySelector('button[aria-label="展开侧边栏"]')).not.toBeNull();
    // The video-to-GIF entry is now an enabled production item; the old hidden
    // "GIF 压缩" label no longer exists anywhere.
    expect(container.querySelector('button[aria-label="视频转 GIF"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="GIF 压缩"]')).toBeNull();
    expect(container.querySelector('button[aria-label="工具箱首页"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="图片压缩"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="批量模板 GIF"]')).toBeNull();
    const sidebarIcons = [...container.querySelectorAll('.app-sidebar-icon svg')];
    expect(sidebarIcons.length).toBeGreaterThan(0);
    expect(sidebarIcons.every((icon) => (
      icon.getAttribute('width') === '18'
      && icon.getAttribute('height') === '18'
      && icon.getAttribute('viewBox') === '0 0 24 24'
    ))).toBe(true);

    act(() => root.unmount());
  });

  it('expands into a grouped menu and persists the chosen state', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<AppSidebar activeTool="video-watermark" onNavigate={vi.fn()} onOpenSettings={vi.fn()} />));

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]')?.click());
    expect(container.querySelector('aside')?.classList.contains('is-collapsed')).toBe(false);
    expect(container.textContent).toContain('生产工具');
    expect(container.textContent).not.toContain('其他工具');
    expect(container.querySelector('button[aria-label="收起侧边栏"]')).not.toBeNull();
    expect(window.localStorage.getItem('brand-material-workbench.sidebar-collapsed.v1')).toBe('false');

    act(() => root.unmount());
  });

  it('lists Logo 与版式 and 自定义构图 as separate production entries', () => {
    const onNavigate = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<AppSidebar activeTool="custom" onNavigate={onNavigate} onOpenSettings={vi.fn()} />));

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]')?.click());
    const logoEntry = container.querySelector<HTMLButtonElement>('button[aria-label="Logo 与版式"]');
    const customEntry = container.querySelector<HTMLButtonElement>('button[aria-label="自定义构图"]');
    expect(logoEntry).not.toBeNull();
    expect(customEntry).not.toBeNull();
    expect(customEntry?.classList.contains('active')).toBe(true);
    expect(logoEntry?.classList.contains('active')).toBe(false);

    act(() => logoEntry?.click());
    expect(onNavigate).toHaveBeenCalledWith('logo-layout');

    act(() => root.unmount());
  });

  it('navigates to the video-to-GIF tool from its production entry', () => {
    const onNavigate = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<AppSidebar activeTool="gif-compress" onNavigate={onNavigate} onOpenSettings={vi.fn()} />));

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="展开侧边栏"]')?.click());
    const gifEntry = container.querySelector<HTMLButtonElement>('button[aria-label="视频转 GIF"]');
    expect(gifEntry).not.toBeNull();
    expect(gifEntry?.classList.contains('active')).toBe(true);

    act(() => gifEntry?.click());
    expect(onNavigate).toHaveBeenCalledWith('gif-compress');

    act(() => root.unmount());
  });
});
