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
      <button type="button" onClick={() => runtime.requestModuleChange('custom')}>切换模块</button>
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
});
