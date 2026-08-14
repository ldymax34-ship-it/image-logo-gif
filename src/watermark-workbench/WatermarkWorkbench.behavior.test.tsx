// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React, { useState, type Dispatch, type SetStateAction } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { MediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import { WatermarkWorkbench } from './WatermarkWorkbench';

const noop = vi.fn() as unknown as Dispatch<SetStateAction<unknown>>;
const asset = { id: 'a', fileName: 'photo.png', objectUrl: 'blob:a', width: 100, height: 50, fileSize: 1, mimeType: 'image/png' };

function makeState(overrides: Partial<MediaWorkbenchState> = {}): MediaWorkbenchState {
  return {
    draftText: '', setDraftText: noop, appliedText: '', setAppliedText: noop,
    specs: [], setSpecs: noop, assets: [asset], setAssets: noop,
    selectedAssetId: 'a', setSelectedAssetId: noop, selectedSpecId: undefined, setSelectedSpecId: noop,
    previewStates: {}, setPreviewStates: noop, boardBrandStates: {}, dispatchBoardBrand: noop as never,
    customPresets: [], setCustomPresets: noop, presetApplyMode: 'replace', setPresetApplyMode: noop,
    focusAssetId: undefined, setFocusAssetId: noop, focusSpecId: undefined, setFocusSpecId: noop,
    focusSession: undefined, setFocusSession: noop, pendingConfirmation: undefined, setPendingConfirmation: noop,
    newPresetName: '', setNewPresetName: noop, exportDialogOpen: false, setExportDialogOpen: noop,
    exporting: false, setExporting: noop, message: '', setMessage: noop, importFailures: [], setImportFailures: noop,
    ...overrides,
  };
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<WatermarkWorkbench onReturn={() => {}} sharedState={makeState()} />); });
  return { container, root };
}

describe('WatermarkWorkbench press-and-hold original view', () => {
  it('shows original on pointerdown and restores on pointerup, leave, cancel, and blur', () => {
    const { container, root } = mount();
    const btn = container.querySelector<HTMLButtonElement>('button.wm-view-original')!;
    expect(btn).not.toBeNull();

    const watermarkCount = () => container.querySelectorAll('.watermark-layer').length;
    const initialCount = watermarkCount();
    expect(initialCount).toBeGreaterThan(0);

    act(() => { btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(watermarkCount()).toBe(0);

    act(() => { btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(watermarkCount()).toBe(initialCount);

    act(() => { btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    act(() => { btn.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true })); });
    // React's synthetic onPointerLeave is delegated from the browser's
    // pointerout event; send both parts of the native leave sequence in jsdom.
    act(() => { btn.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body })); });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(watermarkCount()).toBe(initialCount);

    act(() => { btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    act(() => { btn.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(watermarkCount()).toBe(initialCount);

    act(() => { btn.focus(); btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    expect(watermarkCount()).toBe(0);
    act(() => { btn.blur(); });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(watermarkCount()).toBe(initialCount);

    act(() => root.unmount());
    container.remove();
  });

  it('supports Space and Enter hold with repeat suppression', () => {
    const { container, root } = mount();
    const btn = container.querySelector<HTMLButtonElement>('button.wm-view-original')!;
    act(() => { btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    // repeat keydown should not toggle
    act(() => { btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    act(() => { btn.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    act(() => { btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    act(() => { btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    act(() => { btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })); });
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    act(() => root.unmount());
    container.remove();
  });
});
