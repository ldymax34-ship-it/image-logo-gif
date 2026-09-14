// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { AppRuntimeProvider, useAppRuntime } from './AppRuntimeProvider';

function NavigationProbe() {
  const runtime = useAppRuntime();
  return (
    <div>
      <output data-testid="module">{runtime.activeModule}</output>
      <output data-testid="tool">{runtime.activeTool}</output>
      <button type="button" onClick={() => runtime.requestModuleChange('custom')}>切换模块</button>
      <button type="button" data-testid="open-custom" onClick={() => runtime.navigateToTool('custom')}>自定义构图</button>
      <button type="button" data-testid="open-logo" onClick={() => runtime.navigateToTool('logo-layout')}>Logo 与版式</button>
    </div>
  );
}

function GuardedProbe({ blocked }: { blocked: boolean }) {
  const runtime = useAppRuntime();
  useEffect(() => blocked ? runtime.registerNavigationGuard(() => false) : undefined, [blocked, runtime]);
  return <NavigationProbe />;
}

describe('AppRuntimeProvider module navigation', () => {
  it('keeps the navigation guard in front of module changes', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppRuntimeProvider>
          <GuardedProbe blocked />
        </AppRuntimeProvider>
      );
    });
    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    expect(container.querySelector('[data-testid="module"]')?.textContent).toBe('media');

    act(() => {
      root.render(
        <AppRuntimeProvider>
          <GuardedProbe blocked={false} />
        </AppRuntimeProvider>
      );
    });
    act(() => container.querySelector<HTMLButtonElement>('button')?.click());
    expect(container.querySelector('[data-testid="module"]')?.textContent).toBe('custom');

    act(() => root.unmount());
  });

  it('keeps the independent custom entry and the Logo entry on their own module', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppRuntimeProvider>
          <NavigationProbe />
        </AppRuntimeProvider>
      );
    });
    expect(container.querySelector('[data-testid="module"]')?.textContent).toBe('media');
    expect(container.querySelector('[data-testid="tool"]')?.textContent).toBe('toolbox');

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="open-custom"]')?.click());
    expect(container.querySelector('[data-testid="tool"]')?.textContent).toBe('custom');
    expect(container.querySelector('[data-testid="module"]')?.textContent).toBe('custom');

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="open-logo"]')?.click());
    expect(container.querySelector('[data-testid="tool"]')?.textContent).toBe('logo-layout');
    expect(container.querySelector('[data-testid="module"]')?.textContent).toBe('media');

    act(() => root.unmount());
  });
});
