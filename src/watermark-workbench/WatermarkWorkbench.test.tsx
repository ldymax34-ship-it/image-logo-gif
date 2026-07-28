// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import React, { useState, type Dispatch, type SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardBrandStateMap, BoardPreviewState, MaterialAsset, MaterialSpec, PresetTemplate } from '../core';
import type { BoardBrandAction } from '../modules/media-workbench/boardBrandReducer';
import type { FocusSession } from '../modules/media-workbench/focusSession';
import type { PendingConfirmation, PresetApplyMode, MediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import {
  WatermarkWorkbench,
  buildWatermarkExportItems,
  createWatermarkOutputSpec,
  createWorkbenchWatermarkConfig,
  watermarkOutputName,
  type WatermarkBusinessConfig,
} from './WatermarkWorkbench';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it('renders shared assets with the existing asset list contract', () => {
    const markup = renderToStaticMarkup(<WatermarkWorkbench onReturn={() => undefined} sharedState={makeSharedState({ assets })} />);
    expect(markup).toContain('asset-list');
    expect(markup).toContain('asset-row');
    expect(markup).toContain('workspace wm-workspace');
    expect(markup).toContain('tool-page-icon');
    expect(markup).toContain('preview-panel');
    expect(markup).toContain('spec-panel');
    expect(markup).toContain('导入图片');
    expect(markup).toContain('删除素材 photo.png');
    expect(markup).toContain('photo.png');
    expect(markup).toContain('banner.jpg');
  });

  it('uses the configured scale in the render config', () => {
    const config: WatermarkBusinessConfig = { text: '水印', fontSize: 5, rotation: 0, opacity: .5, offsetX: 1, offsetY: 2, spacingX: 220, spacingY: 160, repeat: false };
    const result = createWorkbenchWatermarkConfig({ width: 1000, height: 500 }, config, { offsetX: 11, scale: 2 });
    if (result.kind !== 'text') throw new Error('expected text watermark config');
    expect(result.fontSize).toBe(50);
    expect(result.offsetX).toBe(11);
    expect(result.offsetY).toBe(2);
  });

  it('keeps watermark font size proportional for smaller output presets', () => {
    const config: WatermarkBusinessConfig = { text: '水印', fontSize: 5, rotation: 0, opacity: .5, offsetX: 0, offsetY: 0, spacingX: 220, spacingY: 160, repeat: false };
    const original = createWorkbenchWatermarkConfig({ width: 1200, height: 800 }, config);
    const small = createWorkbenchWatermarkConfig({ width: 300, height: 200 }, config);
    if (original.kind !== 'text' || small.kind !== 'text') throw new Error('expected text watermark config');
    expect(original.fontSize).toBe(40);
    expect(small.fontSize).toBe(10);
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

  it('falls back to the first shared asset when no selection is stored', () => {
    const markup = renderToStaticMarkup(<WatermarkWorkbench onReturn={() => undefined} sharedState={makeSharedState({ assets })} />);
    expect(markup).toContain('asset-row active');
  });

  it('keeps overrides isolated by shared asset selection', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<StatefulHarness />); });
    const horizontal = container.querySelector<HTMLInputElement>('[aria-label="水平位置偏移"]');
    const vertical = container.querySelector<HTMLInputElement>('[aria-label="垂直位置偏移"]');
    const scale = container.querySelector<HTMLInputElement>('[aria-label="水印缩放"]');
    expect(horizontal).not.toBeNull();
    expect(vertical).not.toBeNull();
    expect(scale).not.toBeNull();
    await act(async () => { changeInput(horizontal!, '37'); changeInput(vertical!, '-12'); changeInput(scale!, '80'); });
    expect(horizontal!.value).toBe('37');
    expect(vertical!.value).toBe('-12');
    expect(scale!.value).toBe('80');
    const secondAsset = container.querySelector<HTMLButtonElement>('img[alt="banner.jpg"]')?.closest('button');
    await act(async () => { secondAsset?.click(); });
    expect(horizontal!.value).toBe('0');
    expect(vertical!.value).toBe('0');
    expect(scale!.value).toBe('100');
    const firstAsset = container.querySelector<HTMLButtonElement>('img[alt="photo.png"]')?.closest('button');
    await act(async () => { firstAsset?.click(); });
    expect(horizontal!.value).toBe('37');
    expect(vertical!.value).toBe('-12');
    expect(scale!.value).toBe('80');
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('applies the current per-image adjustment proportionally to other images', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<StatefulHarness />); });
    const horizontal = container.querySelector<HTMLInputElement>('[aria-label="水平位置偏移"]')!;
    const vertical = container.querySelector<HTMLInputElement>('[aria-label="垂直位置偏移"]')!;
    const scale = container.querySelector<HTMLInputElement>('[aria-label="水印缩放"]')!;
    await act(async () => { changeInput(horizontal, '20'); changeInput(vertical, '10'); changeInput(scale, '80'); });
    const applyButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '其他图片');
    await act(async () => { applyButton?.click(); });
    const secondAsset = container.querySelector<HTMLButtonElement>('img[alt="banner.jpg"]')?.closest('button');
    await act(async () => { secondAsset?.click(); });
    expect(horizontal.value).toBe('40');
    expect(vertical.value).toBe('16');
    expect(scale.value).toBe('80');
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

  it('uses one shared preview-panel export entry and shared task status', () => {
    const markup = renderToStaticMarkup(<WatermarkWorkbench onReturn={() => undefined} sharedState={makeSharedState({ assets, message: '正在处理' })} />);
    expect((markup.match(/aria-label="导出水印图片"/g) ?? [])).toHaveLength(1);
    expect(markup).not.toContain('选择文件夹');
    expect(markup).toContain('status-line');
    expect(markup).toContain('正在处理');
    expect(markup).toContain('原尺寸');
    expect(markup).toContain('大尺寸（75%）');
    expect(markup).toContain('中尺寸（50%）');
    expect(markup).toContain('小尺寸（25%）');
    expect(markup).toContain('其他图片');
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
    expect(fileSystemHarness.saveBlobToOutputTarget.mock.calls.map((call) => call[1])).toEqual([
      'photo_100x50.png',
      'banner_200x80.jpg',
    ]);
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('warns before returning after changing a spacing field', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onReturn = vi.fn();
    await act(async () => { root.render(<WatermarkWorkbench onReturn={onReturn} sharedState={makeSharedState({ assets, selectedAssetId: 'a' })} />); });
    const spacing = [...container.querySelectorAll<HTMLInputElement>('input[type="number"]')]
      .find((input) => input.value === '220');
    await act(async () => { changeInput(spacing!, '240'); });
    const returnButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '返回工具箱');
    await act(async () => { returnButton?.click(); });
    expect(onReturn).not.toHaveBeenCalled();
    expect(container.textContent).toContain('放弃当前设置？');
    await act(async () => { root.unmount(); });
    container.remove();
  });
});
