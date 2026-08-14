// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { MaterialAsset } from '../core';
import { useWatermarkLogoAsset, type LogoLoader, type LogoReleaser } from './useWatermarkLogoAsset';

function makeAsset(id: string): MaterialAsset {
  return { id, fileName: `${id}.png`, objectUrl: `blob:${id}`, width: 100, height: 100, fileSize: 1, mimeType: 'image/png' };
}

type Snapshot = { asset?: MaterialAsset; error: string; loading: boolean };

function mountHook(load: LogoLoader, release: LogoReleaser) {
  const container = document.createElement('div');
  const snapshots: Snapshot[] = [];
  let current: ReturnType<typeof useWatermarkLogoAsset> | undefined;
  function Harness() {
    current = useWatermarkLogoAsset({ load, release });
    snapshots.push({ asset: current.asset, error: current.error, loading: current.loading });
    return null;
  }
  const root = createRoot(container);
  act(() => { root.render(React.createElement(Harness)); });
  return { container, root, snapshots, get current() { return current!; } };
}

describe('useWatermarkLogoAsset', () => {
  it('loads a file and releases the previous asset on replacement', async () => {
    const released: string[] = [];
    const load: LogoLoader = vi.fn(async (file: File) => makeAsset(file.name));
    const release: LogoReleaser = vi.fn((asset) => { released.push(asset.id); });
    const h = mountHook(load, release);

    await act(async () => { await h.current.loadLogo(new File(['a'], 'a.png')); });
    expect(h.current.asset?.id).toBe('a.png');
    expect(release).not.toHaveBeenCalled();

    await act(async () => { await h.current.loadLogo(new File(['b'], 'b.png')); });
    expect(h.current.asset?.id).toBe('b.png');
    expect(released).toContain('a.png');
    expect(released).not.toContain('b.png');
    act(() => h.root.unmount());
  });

  it('surfaces a load failure as an error state without crashing', async () => {
    const load: LogoLoader = vi.fn(async () => { throw new Error('decode failed'); });
    const release: LogoReleaser = vi.fn();
    const h = mountHook(load, release);
    await act(async () => { await h.current.loadLogo(new File(['x'], 'x.png')); });
    expect(h.current.error).toBe('decode failed');
    expect(h.current.asset).toBeUndefined();
    expect(release).not.toHaveBeenCalled();
    act(() => h.root.unmount());
  });

  it('releases the current asset on unmount', async () => {
    const load: LogoLoader = vi.fn(async (file: File) => makeAsset(file.name));
    const release: LogoReleaser = vi.fn();
    const h = mountHook(load, release);
    await act(async () => { await h.current.loadLogo(new File(['a'], 'a.png')); });
    expect(h.current.asset?.id).toBe('a.png');
    act(() => h.root.unmount());
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('clearLogo releases the asset without an error', async () => {
    const load: LogoLoader = vi.fn(async (file: File) => makeAsset(file.name));
    const release: LogoReleaser = vi.fn();
    const h = mountHook(load, release);
    await act(async () => { await h.current.loadLogo(new File(['a'], 'a.png')); });
    act(() => { h.current.clearLogo(); });
    expect(h.current.asset).toBeUndefined();
    expect(release).toHaveBeenCalledTimes(1);
    act(() => h.root.unmount());
  });
});
