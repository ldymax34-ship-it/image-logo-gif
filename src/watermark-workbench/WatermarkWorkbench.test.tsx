// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import React, { useState, type Dispatch, type SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardBrandStateMap, BoardPreviewState, MaterialAsset, MaterialSpec, PresetTemplate } from '../core';
import type { BoardBrandAction } from '../modules/media-workbench/boardBrandReducer';
import type { FocusSession } from '../modules/media-workbench/focusSession';
import type { PendingConfirmation, PresetApplyMode, MediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import { buildWatermarkRenderInput } from './watermarkExport';
import { exportStatusStore } from '../components/export-status/exportStatusStore';
import {
  WatermarkWorkbench,
  buildWatermarkExportItems,
  createWatermarkOutputSpec,
  createWorkbenchWatermarkConfig,
  watermarkOutputName,
  type WatermarkBusinessConfig,
} from './WatermarkWorkbench';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class TestResizeObserver {
  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as Record<string, unknown>).ResizeObserver = TestResizeObserver;
}
if (typeof (globalThis as Record<string, unknown>).PointerEvent === 'undefined') {
  (globalThis as Record<string, unknown>).PointerEvent = (globalThis as Record<string, unknown>).MouseEvent;
}
if (typeof (globalThis as unknown as { Element?: unknown }).Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

const exportHarness = vi.hoisted(() => ({ exportBoardImage: vi.fn().mockResolvedValue(new Blob(['ok'], { type: 'image/png' })) }));
const fileSystemHarness = vi.hoisted(() => ({
  chooseOutputTarget: vi.fn().mockResolvedValue({ kind: 'desktop-directory', path: '/tmp', reservedFileNames: new Set() }),
  saveBlobToOutputTarget: vi.fn().mockImplementation(async (_target, fileName: string) => fileName),
}));
vi.mock('../core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core')>()),
  exportBoardImage: exportHarness.exportBoardImage,
}));
vi.mock('../platform/fileSystem', () => ({
  chooseOutputTarget: fileSystemHarness.chooseOutputTarget,
  saveBlobToOutputTarget: fileSystemHarness.saveBlobToOutputTarget,
}));

function setter<T>(): Dispatch<SetStateAction<T>> {
  return vi.fn((_next: SetStateAction<T>) => undefined);
}

function makeSharedState(overrides: Partial<MediaWorkbenchState> = {}): MediaWorkbenchState {
  return {
    draftText: '', setDraftText: setter<string>(),
    appliedText: '', setAppliedText: setter<string>(),
    specs: [], setSpecs: setter<MaterialSpec[]>(),
    assets: [], setAssets: setter<MaterialAsset[]>(),
    selectedAssetId: undefined, setSelectedAssetId: setter<string | undefined>(),
    selectedSpecId: undefined, setSelectedSpecId: setter<string | undefined>(),
    previewStates: {}, setPreviewStates: setter<Record<string, BoardPreviewState>>(),
    boardBrandStates: {}, dispatchBoardBrand: vi.fn((_action: BoardBrandAction) => undefined),
    customPresets: [], setCustomPresets: setter<PresetTemplate[]>(),
    presetApplyMode: 'replace', setPresetApplyMode: setter<PresetApplyMode>(),
    focusAssetId: undefined, setFocusAssetId: setter<string | undefined>(),
    focusSpecId: undefined, setFocusSpecId: setter<string | undefined>(),
    focusSession: undefined, setFocusSession: setter<FocusSession | undefined>(),
    pendingConfirmation: undefined, setPendingConfirmation: setter<PendingConfirmation | undefined>(),
    newPresetName: '', setNewPresetName: setter<string>(),
    exportDialogOpen: false, setExportDialogOpen: setter<boolean>(),
    exporting: false, setExporting: setter<boolean>(),
    message: '', setMessage: setter<string>(),
    importFailures: [], setImportFailures: setter<string[]>(),
    ...overrides,
  };
}

const assets: MaterialAsset[] = [
  { id: 'a', fileName: 'photo.png', objectUrl: 'blob:a', width: 100, height: 50, fileSize: 10, mimeType: 'image/png' },
  { id: 'b', fileName: 'banner.jpg', objectUrl: 'blob:b', width: 200, height: 80, fileSize: 20, mimeType: 'image/jpeg' },
];

function StatefulHarness() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>('a');
  const state = makeSharedState({ assets, selectedAssetId, setSelectedAssetId });
  return <WatermarkWorkbench onReturn={() => undefined} sharedState={state} />;
}

function sliderThumb(label: string): Element | null {
  return document.querySelector(`[role="slider"][aria-label="${label}"]`);
}
function pressSliderKey(label: string, key: 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown') {
  const thumb = sliderThumb(label);
  if (!thumb) throw new Error(`slider not found: ${label}`);
  thumb.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setterForValue = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setterForValue?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('WatermarkWorkbench', () => {
  beforeEach(() => {
    exportHarness.exportBoardImage.mockClear();
    fileSystemHarness.chooseOutputTarget.mockClear();
    fileSystemHarness.saveBlobToOutputTarget.mockClear();
  });

  it('uses the configured scale in the render config', () => {
    const config: WatermarkBusinessConfig = { contentKind: 'text', text: '水印', fontSize: 5, rotation: 0, opacity: .5, offsetX: 1, offsetY: 2, density: 'dense', pattern: 'single' as const, phaseOffset: 0.5, anchor: 'center' };
    const result = createWorkbenchWatermarkConfig({ width: 1000, height: 500 }, config, { offsetX: 11, scale: 2 })!;
    if (result.kind !== 'text') throw new Error('expected text watermark config');
    expect(result.fontSize).toBe(50);
    expect(result.offsetX).toBe(11);
    expect(result.offsetY).toBe(2);
  });

  it('keeps watermark font size proportional for smaller output presets', () => {
    const config: WatermarkBusinessConfig = { contentKind: 'text', text: '水印', fontSize: 10, rotation: 0, opacity: .5, offsetX: 0, offsetY: 0, density: 'dense', pattern: 'single' as const, phaseOffset: 0.5, anchor: 'center' };
    const original = createWorkbenchWatermarkConfig({ width: 1200, height: 800 }, config)!;
    const small = createWorkbenchWatermarkConfig({ width: 300, height: 200 }, config)!;
    if (original.kind !== 'text' || small.kind !== 'text') throw new Error('expected text watermark config');
    expect(original.fontSize).toBe(80);
    expect(small.fontSize).toBe(20);
  });

  it('uses the same source-name and dimension naming rule as the media workbench', () => {
    const webpAsset: MaterialAsset = { ...assets[0], fileName: '中文 空格.webp', width: 1200, height: 600 };
    const spec = createWatermarkOutputSpec(webpAsset, 'original');
    expect(watermarkOutputName('/tmp/中文 空格.webp', spec)).toBe('中文 空格_1200x600.png');
    expect(watermarkOutputName('/tmp/photo.jpeg', { ...spec, format: 'jpg' })).toBe('photo_1200x600.jpg');
  });

  it('creates proportional output sizes without changing aspect ratio', () => {
    const source = { ...assets[0], width: 1200, height: 800 };
    expect(createWatermarkOutputSpec(source, 'original')).toMatchObject({ width: 1200, height: 800 });
    expect(createWatermarkOutputSpec(source, 'large')).toMatchObject({ width: 900, height: 600 });
    expect(createWatermarkOutputSpec(source, 'medium')).toMatchObject({ width: 600, height: 400 });
    expect(createWatermarkOutputSpec(source, 'small')).toMatchObject({ width: 300, height: 200 });
    for (const size of ['original', 'large', 'medium', 'small'] as const) {
      const output = createWatermarkOutputSpec(source, size);
      expect(output.width / output.height).toBe(1.5);
    }
  });

  it('disambiguates duplicate batch names like the media workbench', () => {
    const duplicateAssets = [assets[0], { ...assets[0], id: 'duplicate' }];
    expect(buildWatermarkExportItems(duplicateAssets, 'original').map((item) => item.fileName)).toEqual([
      'photo_100x50.png',
      'photo_100x50_2.png',
    ]);
  });

  it('keeps overrides isolated by shared asset selection', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<StatefulHarness />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('.wm-collapsible-trigger')?.click(); });
    const thumb = (label: string) => container.querySelector<HTMLElement>(`[role="slider"][aria-label="${label}"]`);
    const valueOf = (label: string) => thumb(label)?.getAttribute('aria-valuenow');
    expect(thumb('X')).not.toBeNull();
    expect(thumb('Y')).not.toBeNull();
    expect(thumb('缩放')).not.toBeNull();
    // Advance X by one step on asset A (photo.png, selected by default).
    await act(async () => { pressSliderKey('X', 'ArrowRight'); });
    expect(valueOf('X')).toBe('1');
    // Switch to asset B and confirm the override does not leak.
    const secondAsset = container.querySelector<HTMLButtonElement>('img[alt="banner.jpg"]')?.closest('button');
    await act(async () => { secondAsset?.click(); });
    expect(valueOf('X')).toBe('0');
    // Switch back to asset A and confirm the override is preserved.
    const firstAsset = container.querySelector<HTMLButtonElement>('img[alt="photo.png"]')?.closest('button');
    await act(async () => { firstAsset?.click(); });
    expect(valueOf('X')).toBe('1');
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('disables export for a real spaces-only text input', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<StatefulHarness />); });
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    const exportButton = container.querySelector<HTMLButtonElement>('[aria-label="导出水印图片"]');
    expect(textarea).not.toBeNull();
    expect(exportButton).not.toBeNull();
    await act(async () => { changeInput(textarea!, '   '); });
    expect(exportButton!.disabled).toBe(true);
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('exports every shared image sequentially through the common naming and save pipeline', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<WatermarkWorkbench onReturn={() => undefined} sharedState={makeSharedState({ assets, selectedAssetId: 'a' })} />); });
    const exportButton = container.querySelector<HTMLButtonElement>('[aria-label="导出水印图片"]');
    await act(async () => { exportButton?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fileSystemHarness.chooseOutputTarget).toHaveBeenCalledTimes(1);
    expect(exportHarness.exportBoardImage).toHaveBeenCalledTimes(2);
    const exportedInput = exportHarness.exportBoardImage.mock.calls[0][0] as { watermarkConfig?: unknown; asset: MaterialAsset; spec: MaterialSpec };
    expect(exportedInput.watermarkConfig).toBeDefined();
    const defaultConfig: WatermarkBusinessConfig = { contentKind: 'text', text: '\u00a9KURO GAMES ALL RIGHTS RESERVED', fontSize: 5, rotation: 45, opacity: 0.5, offsetX: 0, offsetY: 0, pattern: 'brick', density: 'dense', phaseOffset: 0.5, anchor: 'center' };
    const previewInput = buildWatermarkRenderInput({ asset: exportedInput.asset, spec: exportedInput.spec }, defaultConfig, undefined, undefined, {});
    expect(exportedInput.watermarkConfig).toEqual(previewInput.watermarkConfig);
    expect(fileSystemHarness.saveBlobToOutputTarget.mock.calls.map((call) => call[1])).toEqual([
      'photo_100x50.png',
      'banner_200x80.jpg',
    ]);
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('explicitly requests the global export center after the output picker returns', async () => {
    const requestOpen = vi.spyOn(exportStatusStore, 'requestOpen');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<WatermarkWorkbench onReturn={() => undefined} sharedState={makeSharedState({ assets, selectedAssetId: 'a' })} />); });
    const exportButton = container.querySelector<HTMLButtonElement>('[aria-label="导出水印图片"]');
    await act(async () => { exportButton?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fileSystemHarness.chooseOutputTarget).toHaveBeenCalledTimes(1);
    // 不再只依赖「新批次自动展开」：任务注册后显式打开/聚焦全局导出中心。
    expect(requestOpen).toHaveBeenCalledTimes(1);
    requestOpen.mockRestore();
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('does not render a duplicate page-level return button after changing a watermark field', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onReturn = vi.fn();
    await act(async () => { root.render(<WatermarkWorkbench onReturn={onReturn} sharedState={makeSharedState({ assets, selectedAssetId: 'a' })} />); });
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
    await act(async () => { changeInput(textarea, '改变了的水印文字'); });
    const returnButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '返回工具箱');
    expect(returnButton).toBeUndefined();
    expect(onReturn).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
    container.remove();
  });
});
