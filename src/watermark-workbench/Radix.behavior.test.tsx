// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React, { type Dispatch, type SetStateAction } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { MediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import { WatermarkWorkbench } from './WatermarkWorkbench';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const noop = vi.fn() as unknown as Dispatch<SetStateAction<unknown>>;
const asset = { id: 'a', fileName: 'photo.png', objectUrl: 'blob:a', width: 100, height: 50, fileSize: 1, mimeType: 'image/png' };

function makeState(): MediaWorkbenchState {
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
  };
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<WatermarkWorkbench onReturn={() => {}} sharedState={makeState()} />); });
  return { container, root };
}

function pressKey(el: Element, key: string, init: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

async function flushTimers() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

// Faithful simulation of a native <button>'s Enter/Space activation: the
// browser fires a click after keyup for these keys. jsdom does not, so we
// reproduce that consequence in the harness, still driven from key events.
async function activateButton(el: Element, key: 'Enter' | ' ') {
  act(() => { pressKey(el, key); el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  await flushTimers();
}

describe('Radix behavior', () => {
  it('Tabs: ArrowRight moves focus and selects the next tab', async () => {
    const { container, root } = mount();
    const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
    const textTab = tabs.find((t) => t.textContent === '文字')!;
    const logoTab = tabs.find((t) => t.textContent === 'Logo')!;
    act(() => { textTab.focus(); });
    act(() => { pressKey(textTab, 'ArrowRight'); });
    await flushTimers();
    expect(document.activeElement).toBe(logoTab);
    expect(logoTab.getAttribute('data-state')).toBe('active');
    expect(logoTab.getAttribute('aria-selected')).toBe('true');
    act(() => { pressKey(logoTab, 'ArrowLeft'); });
    await flushTimers();
    expect(document.activeElement).toBe(textTab);
    expect(textTab.getAttribute('data-state')).toBe('active');
    act(() => root.unmount());
    container.remove();
  });

  it('Collapsible: Enter and Space toggle aria-expanded and content', async () => {
    const { container, root } = mount();
    const trigger = container.querySelector<HTMLButtonElement>('.wm-collapsible-trigger')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await activateButton(trigger, 'Enter');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.wm-collapsible-content')?.getAttribute('data-state')).toBe('open');
    await activateButton(trigger, ' ');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const closedContent = container.querySelector<HTMLElement>('.wm-collapsible-content');
    expect(closedContent?.getAttribute('data-state')).toBe('closed');
    expect(closedContent?.hasAttribute('hidden')).toBe(true);
    act(() => root.unmount());
    container.remove();
  });

  it('Tooltip: focus opens portal content, Escape and blur close it', async () => {
    vi.useFakeTimers();
    const { container, root } = mount();
    const trigger = container.querySelector<HTMLButtonElement>('button.wm-view-original')!;
    act(() => { trigger.focus(); });
    act(() => { vi.advanceTimersByTime(800); });
    const content = document.body.querySelector<HTMLElement>('[role="tooltip"]');
    expect(content).not.toBeNull();
    expect(content!.getAttribute('data-state')).toBe('instant-open');
    act(() => { content!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    act(() => { vi.advanceTimersByTime(0); });
    expect(document.body.querySelector<HTMLElement>('[role="tooltip"]')?.getAttribute('data-state')).not.toBe('instant-open');

    act(() => { trigger.blur(); trigger.focus(); });
    act(() => { vi.advanceTimersByTime(800); });
    expect(document.body.querySelector<HTMLElement>('[role="tooltip"]')?.getAttribute('data-state')).toBe('instant-open');
    act(() => { trigger.blur(); });
    act(() => { vi.advanceTimersByTime(0); });
    const afterBlur = document.body.querySelector<HTMLElement>('[role="tooltip"]');
    expect(afterBlur?.getAttribute('data-state')).not.toBe('instant-open');
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
  });

  it('Select: Escape closes and restores focus to the trigger', async () => {
    const { container, root } = mount();
    const trigger = container.querySelector<HTMLElement>('[role="combobox"]')!;
    act(() => { trigger.focus(); });
    act(() => { pressKey(trigger, 'Enter'); });
    await flushTimers();
    const options = document.body.querySelectorAll<HTMLElement>('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    act(() => { (document.activeElement as HTMLElement | null)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await flushTimers();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => root.unmount());
    container.remove();
  });

  it('Select: keyboard selection updates the real arrangement and anchor controls', async () => {
    const { container, root } = mount();
    const trigger = container.querySelector<HTMLElement>('[role="combobox"]')!;
    act(() => { trigger.focus(); pressKey(trigger, 'Enter'); });
    await flushTimers();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const active = document.body.querySelector<HTMLElement>('[data-highlighted]') ?? document.activeElement;
    expect(active).not.toBeNull();
    act(() => { pressKey(active!, 'ArrowUp'); });
    await flushTimers();
    const singleOption = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option) => option.textContent?.trim() === '单个');
    expect(singleOption?.getAttribute('data-highlighted')).toBe('');
    act(() => { pressKey(singleOption!, 'Enter'); });
    await flushTimers();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('单个');
    expect(container.querySelector('[aria-label="九宫格锚点"]')).not.toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
