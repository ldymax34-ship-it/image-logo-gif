// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders the Logo secondary navigation as compact tabs without a duplicate return shell', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onModuleChange = vi.fn();

    act(() => {
      root.render(
        <AppShell activeModule="media" onModuleChange={onModuleChange} header={<header><h1>Logo 与版式</h1></header>}>
          <div>内容</div>
        </AppShell>
      );
    });

    expect(container.querySelector('.app-shell-header')).not.toBeNull();
    expect(container.querySelector('.app-shell-header .capsule-back-button')).toBeNull();
    expect(container.querySelector('.module-nav')).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('设媒');
    expect(container.querySelector('.module-glyph')).toBeNull();
    expect(container.querySelector('.module-status-dot')).toBeNull();
    expect(container.querySelector('[role="tab"]')?.getAttribute('title')).toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]')?.click();
    });
    expect(onModuleChange).toHaveBeenCalledWith('custom');

    act(() => root.unmount());
  });
});
