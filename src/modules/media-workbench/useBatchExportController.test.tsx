// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportStatusStore } from '../../components/export-status/exportStatusStore';
import * as toastBus from '../../components/ui/toastBus';
import type { ExportJob, MediaExportRequest } from '../../services/export';
import { useBatchExportController, type BatchExportCallbacks } from './useBatchExportController';

type ControllerRequest = Omit<MediaExportRequest, 'outputTarget' | 'onProgress' | 'onJobStart' | 'onJobResult'>;

const { chooseOutputTarget, joinNativePath } = vi.hoisted(() => ({
  chooseOutputTarget: vi.fn(),
  joinNativePath: vi.fn()
}));
vi.mock('../../platform/fileSystem', () => ({
  chooseOutputTarget,
  joinNativePath
}));

const { exportMediaBatch } = vi.hoisted(() => ({ exportMediaBatch: vi.fn() }));
vi.mock('../../services/export', () => ({
  exportMediaBatch
}));

const jobs = [
  { id: 'a:s300:zh-CN', plannedFileName: 'hero_zh_300x300.png', specSnapshot: { width: 300, height: 300, format: 'png' } },
  { id: 'b:s300:ko-KR', plannedFileName: 'hero_ko_300x300.jpg', specSnapshot: { width: 600, height: 600, format: 'jpg' } }
] as unknown as ExportJob[];

function makeRequest(): ControllerRequest {
  return {
    jobs,
    boardBrandStates: {} as ControllerRequest['boardBrandStates'],
    brandAssets: [],
    brandLayer: { logoEnabled: false, cprEnabled: false } as ControllerRequest['brandLayer'],
    brandSettings: {} as ControllerRequest['brandSettings'],
    format: 'png',
    quality: 0.9,
    autoCompressJpeg: true
  };
}

function Harness({ request, callbacks }: { request: ControllerRequest; callbacks?: BatchExportCallbacks }) {
  const controller = useBatchExportController();
  return <button onClick={() => void controller.run(request, callbacks)}>run</button>;
}

type DesktopTarget = { kind: 'desktop-directory'; path: string; reservedFileNames: Set<string> };
const desktopTarget = (path: string): DesktopTarget => ({ kind: 'desktop-directory', path, reservedFileNames: new Set<string>() });

beforeEach(() => {
  exportStatusStore.resetForTests();
  exportMediaBatch.mockReset();
  chooseOutputTarget.mockReset();
  joinNativePath.mockReset();
});

afterEach(() => {
  exportStatusStore.resetForTests();
  vi.restoreAllMocks();
});

describe('useBatchExportController', () => {
  it('registers a media batch as queued, then flips each job to completed with size and output path', async () => {
    chooseOutputTarget.mockResolvedValue(desktopTarget('/tmp/输出'));
    joinNativePath.mockImplementation((directory: string, name: string) => `${directory}/${name}`);
    exportMediaBatch.mockImplementation(async (request: { jobs: ExportJob[]; onJobStart?: (j: ExportJob, i: number) => void; onJobResult?: (j: ExportJob, i: number, o: { result: string; outputBytes: number; actualFileName: string }) => void; onProgress?: (p: { current: number; total: number }) => void }) => {
      for (const [index, job] of request.jobs.entries()) request.onJobStart?.(job, index);
      for (const [index, job] of request.jobs.entries()) {
        request.onJobResult?.(job, index, { result: 'success', outputBytes: 2048, actualFileName: job.plannedFileName });
      }
      request.onProgress?.({ current: request.jobs.length, total: request.jobs.length });
      return { completed: request.jobs.length, failures: [], outcomes: [] };
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Harness request={makeRequest()} />); });
    const button = container.querySelector('button')!;
    await act(async () => { button.click(); });

    const snapshot = exportStatusStore.getSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.every((task) => task.source === 'media-batch')).toBe(true);
    expect(snapshot.every((task) => task.batchId === snapshot[0].batchId)).toBe(true);
    expect(snapshot.every((task) => task.status === 'completed')).toBe(true);
    expect(snapshot.map((task) => task.size)).toEqual(['2 KB', '2 KB']);

    act(() => root.unmount());
    container.remove();
  });

  it('requests export-center open and signals "started" after registration, before the batch completes', async () => {
    const requestOpen = vi.spyOn(exportStatusStore, 'requestOpen').mockImplementation(() => {});
    chooseOutputTarget.mockResolvedValue(desktopTarget('/tmp'));
    joinNativePath.mockImplementation((directory: string, name: string) => `${directory}/${name}`);

    let resolveBatch!: (value: unknown) => void;
    exportMediaBatch.mockReturnValue(new Promise((resolve) => { resolveBatch = resolve; }));

    const onExportingChange = vi.fn();
    const notify = vi.spyOn(toastBus, 'notify');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Harness request={makeRequest()} callbacks={{ onExportingChange }} />); });
    const button = container.querySelector('button')!;
    await act(async () => { button.click(); });

    // Target accepted + tasks registered + explicit open, all before the batch resolves.
    expect(requestOpen).toHaveBeenCalledTimes(1);
    expect(onExportingChange).toHaveBeenCalledWith(true);
    expect(exportStatusStore.getSnapshot()).toHaveLength(2);
    expect(exportStatusStore.getSnapshot().every((task) => task.status === 'queued')).toBe(true);
    expect(notify).not.toHaveBeenCalled();

    // Simulate the dialog closing immediately after run() reports that it started.
    act(() => root.unmount());
    await act(async () => { resolveBatch({ completed: 2, failures: [], outcomes: [] }); });

    expect(onExportingChange).toHaveBeenCalledWith(false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('success', '已导出 2 个文件');
    container.remove();
  });

  it('stores a full native output path (spaces/non-ASCII, collision-renamed) for desktop-directory', async () => {
    chooseOutputTarget.mockResolvedValue(desktopTarget('/tmp/中文 空格'));
    joinNativePath.mockImplementation((directory: string, name: string) => `${directory}/${name}`);
    exportMediaBatch.mockImplementation(async (request: { jobs: ExportJob[]; onJobStart?: (j: ExportJob, i: number) => void; onJobResult?: (j: ExportJob, i: number, o: { result: string; outputBytes: number; actualFileName: string }) => void }) => {
      for (const [index, job] of request.jobs.entries()) request.onJobStart?.(job, index);
      request.onJobResult?.(request.jobs[0], 0, { result: 'success', outputBytes: 2048, actualFileName: '封面_2.png' });
      request.onJobResult?.(request.jobs[1], 1, { result: 'success', outputBytes: 4096, actualFileName: 'hero_2.jpg' });
      return { completed: 2, failures: [], outcomes: [] };
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Harness request={makeRequest()} />); });
    const button = container.querySelector('button')!;
    await act(async () => { button.click(); });

    expect(joinNativePath).toHaveBeenCalledWith('/tmp/中文 空格', '封面_2.png');
    expect(joinNativePath).toHaveBeenCalledWith('/tmp/中文 空格', 'hero_2.jpg');
    const snapshot = exportStatusStore.getSnapshot();
    expect(snapshot.map((task) => task.outputPath)).toEqual(['/tmp/中文 空格/封面_2.png', '/tmp/中文 空格/hero_2.jpg']);

    act(() => root.unmount());
    container.remove();
  });

  it('stores no revealable output path for browser/download output', async () => {
    chooseOutputTarget.mockResolvedValue({ kind: 'downloads' });
    exportMediaBatch.mockImplementation(async (request: { jobs: ExportJob[]; onJobStart?: (j: ExportJob, i: number) => void; onJobResult?: (j: ExportJob, i: number, o: { result: string; outputBytes: number; actualFileName: string }) => void }) => {
      for (const [index, job] of request.jobs.entries()) request.onJobStart?.(job, index);
      for (const [index, job] of request.jobs.entries()) {
        request.onJobResult?.(job, index, { result: 'success', outputBytes: 2048, actualFileName: job.plannedFileName });
      }
      return { completed: 2, failures: [], outcomes: [] };
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Harness request={makeRequest()} />); });
    const button = container.querySelector('button')!;
    await act(async () => { button.click(); });

    const snapshot = exportStatusStore.getSnapshot();
    expect(snapshot.every((task) => task.status === 'completed')).toBe(true);
    expect(snapshot.every((task) => task.outputPath === undefined)).toBe(true);
    expect(joinNativePath).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it('marks a failed job with its reason without rolling back the batch', async () => {
    chooseOutputTarget.mockResolvedValue(desktopTarget('/tmp'));
    exportMediaBatch.mockImplementation(async (request: { jobs: ExportJob[]; onJobStart?: (j: ExportJob, i: number) => void; onJobResult?: (j: ExportJob, i: number, o: { result: string; reason?: string }) => void }) => {
      for (const [index, job] of request.jobs.entries()) request.onJobStart?.(job, index);
      request.onJobResult?.(request.jobs[0], 0, { result: 'failed', reason: '磁盘已满' });
      request.onJobResult?.(request.jobs[1], 1, { result: 'failed', reason: '资源缺失' });
      return { completed: 0, failures: [], outcomes: [] };
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Harness request={makeRequest()} />); });
    const button = container.querySelector('button')!;
    await act(async () => { button.click(); });

    const snapshot = exportStatusStore.getSnapshot();
    expect(snapshot.every((task) => task.status === 'failed')).toBe(true);
    expect(snapshot.map((task) => task.error)).toEqual(['磁盘已满', '资源缺失']);

    act(() => root.unmount());
    container.remove();
  });

  it('emits one failure toast for a batch summary instead of one toast per failed job', async () => {
    const notify = vi.spyOn(toastBus, 'notify');
    chooseOutputTarget.mockResolvedValue(desktopTarget('/tmp'));
    exportMediaBatch.mockResolvedValue({
      completed: 0,
      failures: [{ item: jobs[0], message: '磁盘已满' }, { item: jobs[1], message: '资源缺失' }],
      outcomes: []
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Harness request={makeRequest()} />); });
    await act(async () => { container.querySelector<HTMLButtonElement>('button')?.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('2 个失败'));
    act(() => root.unmount());
    container.remove();
  });
});
