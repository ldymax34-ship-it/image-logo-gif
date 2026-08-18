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
    expect(container.querySelector('button[aria-label="GIF 压缩"]')).toBeNull();
    expect(container.querySelector('button[aria-label="工具箱首页"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="批量模板 GIF"]')).toBeNull();

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
});
