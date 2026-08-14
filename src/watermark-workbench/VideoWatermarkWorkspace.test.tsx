// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import React, { useState, type Dispatch, type SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardBrandAction } from '../modules/media-workbench/boardBrandReducer';
import type { MediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import type { MaterialAsset, MaterialSpec, BoardPreviewState, PresetTemplate } from '../core';
import type { FocusSession } from '../modules/media-workbench/focusSession';
import type { PendingConfirmation, PresetApplyMode } from '../modules/media-workbench/useMediaWorkbenchState';
import type { MediaDesktopApi, WatermarkPreviewStatusEvent, WatermarkQueueStatusEvent, WatermarkVideoOptions } from '../gif-media/mediaDesktop';
import type { MediaTaskEvent, MediaProbeResult } from '../gif-media/mediaTypes';
import { WatermarkWorkbench, type WatermarkBusinessConfig } from './WatermarkWorkbench';
import { VideoWatermarkWorkspace } from './VideoWatermarkWorkspace';

const config: WatermarkBusinessConfig = {
  contentKind: 'text', text: '视频水印', fontSize: 6, rotation: 0, opacity: 0.5,
  offsetX: 0, offsetY: 0, spacingX: 220, spacingY: 160, pattern: 'tiled', phaseOffset: 0.5, anchor: 'center',
};

function setter<T>(): Dispatch<SetStateAction<T>> { return () => undefined; }

function sharedState(overrides: Partial<MediaWorkbenchState> = {}): MediaWorkbenchState {
  return {
    draftText: '', setDraftText: setter<string>(), appliedText: '', setAppliedText: setter<string>(),
    specs: [], setSpecs: setter<MaterialSpec[]>(), assets: [], setAssets: setter<MaterialAsset[]>(),
    selectedAssetId: undefined, setSelectedAssetId: setter<string | undefined>(), selectedSpecId: undefined, setSelectedSpecId: setter<string | undefined>(),
    previewStates: {}, setPreviewStates: setter<Record<string, BoardPreviewState>>(), boardBrandStates: {}, dispatchBoardBrand: (_action: BoardBrandAction) => undefined,
    customPresets: [], setCustomPresets: setter<PresetTemplate[]>(), presetApplyMode: 'replace' as PresetApplyMode, setPresetApplyMode: setter<PresetApplyMode>(),
    focusAssetId: undefined, setFocusAssetId: setter<string | undefined>(), focusSpecId: undefined, setFocusSpecId: setter<string | undefined>(), focusSession: undefined as FocusSession | undefined, setFocusSession: setter<FocusSession | undefined>(),
    pendingConfirmation: undefined as PendingConfirmation | undefined, setPendingConfirmation: setter<PendingConfirmation | undefined>(), newPresetName: '', setNewPresetName: setter<string>(),
    exportDialogOpen: false, setExportDialogOpen: setter<boolean>(), exporting: false, setExporting: setter<boolean>(), message: '', setMessage: setter<string>(), importFailures: [], setImportFailures: setter<string[]>(),
    ...overrides,
  };
}

function createApi() {
  let taskListener: ((event: MediaTaskEvent) => void) | undefined;
  let queueListener: ((event: WatermarkQueueStatusEvent) => void) | undefined;
  let previewListener: ((event: WatermarkPreviewStatusEvent) => void) | undefined;
  const stopTask = vi.fn();
  const stopQueue = vi.fn();
  const stopPreview = vi.fn();
  const pickVideoFiles = vi.fn(async () => ['/tmp/中文 空格/clip.mp4', '/tmp/skip.avi']);
  const pickOutputDirectory = vi.fn(async () => '/tmp/中文 空格/output');
  const probeMedia = vi.fn(async (_inputPath: string): Promise<MediaProbeResult> => ({ duration: 3.5, width: 640, height: 360, fps: 30, codec: 'h264', hasAudio: true }));
  const startWatermarkPreview = vi.fn(async ({ taskId }: { taskId: string }) => ({ taskId, outputPath: `/tmp/${taskId}.png` }));
  const cancelWatermarkPreview = vi.fn(async (_taskId: string) => undefined);
  const startWatermarkTask = vi.fn<MediaDesktopApi['startWatermarkTask']>(async ({ taskId, options: _options }) => ({ taskId, outputPath: `/tmp/${taskId}.mp4` }));
  const api: MediaDesktopApi = {
    getEngineStatus: async () => ({ ready: true, message: '', ffmpegVersion: 'test', ffprobeVersion: 'test' }),
    pickMediaFiles: async () => [], pickVideoFiles, pickWatermarkFiles: async () => [], pickWatermarkImage: async () => null,
    pickTemplateFiles: async () => [], pickOutputDirectory, startGifTask: async (request) => ({ taskId: request.taskId, outputPath: '/tmp/gif.gif' }),
    startWatermarkTask, probeMedia, previewGifFrame: async (request) => ({ taskId: request.taskId, outputPath: '/tmp/frame.gif' }),
    cancelPreviewTask: async () => undefined, cancelTask: async () => undefined,
    listenTaskEvents: async (listener) => { taskListener = listener; return stopTask; },
    startWatermarkPreview, cancelWatermarkPreview,
    listenWatermarkQueueEvents: async (listener) => { queueListener = listener; return stopQueue; },
    listenWatermarkPreviewEvents: async (listener) => { previewListener = listener; return stopPreview; },
    listenDroppedPaths: async () => () => undefined,
  };
  return { api, pickVideoFiles, pickOutputDirectory, probeMedia, startWatermarkPreview, cancelWatermarkPreview, startWatermarkTask, stopTask, stopQueue, stopPreview, getTaskListener: () => taskListener, getQueueListener: () => queueListener, getPreviewListener: () => previewListener };
}

function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });
  return { container, root };
}

function StatefulVideo({ api }: { api: MediaDesktopApi }) {
  const [value, setValue] = useState(config);
  const updateConfig = <K extends keyof WatermarkBusinessConfig>(key: K, next: WatermarkBusinessConfig[K]) => setValue((previous) => ({ ...previous, [key]: next }));
  return <VideoWatermarkWorkspace config={value} updateConfig={updateConfig} injectedApi={api} />;
}

describe('video watermark workspace', () => {
  it('mounts the same workbench in video mode and switches back to image mode', async () => {
    const harness = createApi();
    const mounted = mount(<WatermarkWorkbench onReturn={() => undefined} sharedState={sharedState()} initialMode="video" injectedVideoApi={harness.api} />);
    expect(mounted.container.querySelector('[aria-label="视频素材"]')).not.toBeNull();
    const imageTab = [...mounted.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent === '图片');
    const videoTab = [...mounted.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent === '视频');
    expect(imageTab).not.toBeUndefined();
    expect(videoTab).not.toBeUndefined();
    await act(async () => {
      imageTab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false }));
      await Promise.resolve();
    });
    expect(mounted.container.querySelector('[aria-label="水印素材"]')).not.toBeNull();
    act(() => { mounted.root.unmount(); });
    mounted.container.remove();
  });

  it('filters video selection, renders metadata, starts preview, and removes listeners on unmount', async () => {
    const harness = createApi();
    const mounted = mount(<StatefulVideo api={harness.api} />);
    const choose = [...mounted.container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择 MP4 / MOV'));
    await act(async () => { choose?.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(harness.pickVideoFiles).toHaveBeenCalledTimes(1);
    expect(mounted.container.textContent).toContain('clip.mp4');
    expect(mounted.container.textContent).toContain('640 × 360');
    expect(mounted.container.textContent).toContain('有声');
    const output = [...mounted.container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择文件夹'));
    await act(async () => { output?.click(); await new Promise((resolve) => setTimeout(resolve, 10)); });
    // The preview effect is intentionally debounced through the real timer;
    // flush one additional turn for the state commit and effect callback.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    const previewTaskId = harness.startWatermarkPreview.mock.calls[0][0].taskId;
    act(() => { harness.getPreviewListener()?.({ taskId: previewTaskId, status: 'completed', outputPath: `/tmp/${previewTaskId}.png` }); });
    expect(mounted.container.querySelector('img[alt="视频水印预览"]')).not.toBeNull();
    act(() => { mounted.root.unmount(); });
    expect(harness.stopTask).toHaveBeenCalledTimes(1);
    expect(harness.stopQueue).toHaveBeenCalledTimes(1);
    expect(harness.stopPreview).toHaveBeenCalledTimes(1);
    expect(harness.cancelWatermarkPreview).toHaveBeenCalledWith(previewTaskId);
    mounted.container.remove();
  });

  it('freezes queue options and applies monotonic progress with one terminal outcome', async () => {
    const harness = createApi();
    const mounted = mount(<StatefulVideo api={harness.api} />);
    const choose = [...mounted.container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择 MP4 / MOV'));
    await act(async () => { choose?.click(); await new Promise((resolve) => setTimeout(resolve, 20)); await Promise.resolve(); });
    const output = [...mounted.container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择文件夹'));
    await act(async () => { output?.click(); await Promise.resolve(); });
    const enqueue = [...mounted.container.querySelectorAll('button')].find((button) => button.textContent?.includes('加入队列'));
    await act(async () => { enqueue?.click(); await Promise.resolve(); });
    expect(harness.startWatermarkTask).toHaveBeenCalledTimes(1);
    const request = harness.startWatermarkTask.mock.calls[0][0];
    expect(request.options).toMatchObject({ kind: 'text', pattern: 'tiled', outputDirectory: '/tmp/中文 空格/output' });
    const taskId = request.taskId;
    act(() => { harness.getQueueListener()?.({ taskId, status: 'processing' }); });
    act(() => { harness.getTaskListener()?.({ kind: 'progress', taskId, progress: 0.8 }); });
    act(() => { harness.getTaskListener()?.({ kind: 'progress', taskId, progress: 0.2 }); });
    expect(mounted.container.textContent).toContain('80%');
    act(() => { harness.getTaskListener()?.({ kind: 'completed', taskId, outputPath: '/tmp/final.mp4', outputBytes: 20 }); });
    act(() => { harness.getTaskListener()?.({ kind: 'failed', taskId, message: 'late failure' }); });
    act(() => { harness.getTaskListener()?.({ kind: 'progress', taskId, progress: 0.1 }); });
    expect(mounted.container.textContent).toContain('已完成');
    expect(mounted.container.textContent).not.toContain('late failure');
    act(() => { mounted.root.unmount(); });
    mounted.container.remove();
  });

  it('surfaces typed busy rejection without starting a second preview', async () => {
    const harness = createApi();
    harness.startWatermarkPreview.mockImplementationOnce(async ({ taskId }: { taskId: string }) => {
      harness.getPreviewListener()?.({ taskId, status: 'rejectedBusy', message: '正式视频任务正在排队或处理' });
      return { taskId, outputPath: '' };
    });
    const mounted = mount(<StatefulVideo api={harness.api} />);
    const choose = [...mounted.container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择 MP4 / MOV'));
    await act(async () => { choose?.click(); await new Promise((resolve) => setTimeout(resolve, 20)); await Promise.resolve(); });
    const output = [...mounted.container.querySelectorAll('button')].find((button) => button.textContent?.includes('选择文件夹'));
    await act(async () => { output?.click(); await new Promise((resolve) => setTimeout(resolve, 50)); await Promise.resolve(); });
    const textArea = mounted.container.querySelector<HTMLTextAreaElement>('textarea');
    await act(async () => { textArea?.dispatchEvent(new Event('blur', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 350)); await Promise.resolve(); });
    expect(harness.getPreviewListener()).not.toBeUndefined();
    expect(mounted.container.textContent).toContain('正式任务忙碌');
    expect(harness.startWatermarkPreview).toHaveBeenCalledTimes(1);
    act(() => { mounted.root.unmount(); });
    mounted.container.remove();
  });
});
