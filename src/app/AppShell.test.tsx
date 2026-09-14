// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders only the page header and the active module content', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppShell activeModule="media" header={<header><h1>Logo 与版式</h1></header>}>
          <div>内容</div>
        </AppShell>
      );
    });

    expect(container.querySelector('.app-shell-header')).not.toBeNull();
    expect(container.querySelector('.app-shell-header .capsule-back-button')).toBeNull();
    // 设媒 / 自定义 现在各自有独立入口，页面内不再重复一套模块导航。
    expect(container.querySelector('.module-nav')).toBeNull();
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('.app-module-content-media')?.textContent).toBe('内容');

    act(() => root.unmount());
  });

  it('keeps the custom module content class for the custom composition entry', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppShell activeModule="custom" header={<header><h1>Logo 与版式</h1></header>}>
          <div>自定义内容</div>
        </AppShell>
      );
    });

    expect(container.querySelector('.app-module-content-custom')?.textContent).toBe('自定义内容');

    act(() => root.unmount());
  });
});
