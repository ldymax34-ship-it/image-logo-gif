// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContentFrame } from './AppContentFrame';

vi.mock('../gif-media/mediaDesktop', () => ({
  loadMediaDesktopApi: vi.fn(async () => {
    throw new Error('no desktop bridge in jsdom');
  }),
}));

describe('AppContentFrame', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  async function render(active: boolean) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AppContentFrame
          environmentCheckActive={active}
          onEnvironmentCheckComplete={vi.fn()}
        >
          <div data-testid="workspace">workspace stays mounted</div>
        </AppContentFrame>
      );
    });
    return { container, root };
  }

  it('keeps the workspace mounted alongside the active environment check overlay', async () => {
    const { container, root } = await render(true);
    // The regression: AppContent must NOT early-return and replace the whole
    // tree when a settings re-detect flips the check active. The workspace
    // stays in the DOM and the check renders as a sibling fixed overlay.
    expect(container.querySelector('[data-testid="workspace"]')).not.toBeNull();
    expect(container.querySelector('.env-check')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('renders only the workspace when the check is inactive', async () => {
    const { container, root } = await render(false);
    expect(container.querySelector('[data-testid="workspace"]')).not.toBeNull();
    expect(container.querySelector('.env-check')).toBeNull();
    await act(async () => root.unmount());
  });
});
