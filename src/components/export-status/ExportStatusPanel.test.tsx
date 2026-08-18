// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ExportStatusPanel } from './ExportStatusPanel';
import { exportStatusStore } from './exportStatusStore';
import type { ExportTask } from './ExportStatus';

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  exportStatusStore.resetForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  exportStatusStore.resetForTests();
});

describe('exportStatusStore', () => {
  it('tracks a task through queued → exporting → completed → cleared', () => {
    const snapshots: ExportTask[][] = [];
    const unsubscribe = exportStatusStore.subscribe((tasks) => snapshots.push(tasks));

    exportStatusStore.upsert({ id: 'a', batchId: 'b1', source: 'image-watermark', name: 'A', extension: 'png', progress: 0, status: 'queued' });
    expect(snapshots.at(-1)?.[0]).toMatchObject({ status: 'queued', progress: 0, batchId: 'b1' });

    exportStatusStore.patch('a', { status: 'exporting', progress: 42 });
    expect(snapshots.at(-1)?.[0]).toMatchObject({ status: 'exporting', progress: 42 });

    exportStatusStore.patch('a', { status: 'completed', progress: 100 });
    exportStatusStore.clearFinished();
    expect(snapshots.at(-1)).toEqual([]);

    unsubscribe();
  });

  it('never rolls a terminal task back to a live status (terminal-state protection)', () => {
    exportStatusStore.upsert({ id: 'v1', batchId: 'vb', source: 'video-watermark', name: 'V', extension: 'mp4', progress: 100, status: 'completed' });
    // A stale "processing" event arrives after completion.
    exportStatusStore.upsert({ id: 'v1', batchId: 'vb', source: 'video-watermark', name: 'V', extension: 'mp4', progress: 40, status: 'exporting' });
    expect(exportStatusStore.getSnapshot()[0]).toMatchObject({ id: 'v1', status: 'completed', progress: 100 });
    exportStatusStore.upsert({ id: 'v1', batchId: 'vb', source: 'video-watermark', name: 'V', extension: 'mp4', progress: 100, status: 'failed', error: 'late failure' });
    expect(exportStatusStore.getSnapshot()[0]).toMatchObject({ id: 'v1', status: 'completed', progress: 100 });
  });

  it('scopes cleanup to a single batch so concurrent batches do not collide', () => {
    exportStatusStore.upsert({ id: 'm1', batchId: 'media-b', source: 'media-batch', name: 'M', extension: 'png', progress: 50, status: 'exporting' });
    exportStatusStore.upsert({ id: 'w1', batchId: 'wm-b', source: 'image-watermark', name: 'W', extension: 'jpg', progress: 0, status: 'queued' });

    exportStatusStore.clearBatch('media-b');

    const remaining = exportStatusStore.getSnapshot();
    expect(remaining.map((task) => task.id)).toEqual(['w1']);
  });

  it('syncBatch reconciles membership for only its own batch', () => {
    exportStatusStore.upsert({ id: 'other', batchId: 'other-b', source: 'custom-export', name: 'O', extension: 'png', progress: 0, status: 'queued' });
    exportStatusStore.syncBatch('video-b', [
      { id: 'v1', batchId: 'video-b', source: 'video-watermark', name: 'clip', extension: 'mp4', progress: 0, status: 'queued' }
    ]);
    exportStatusStore.syncBatch('video-b', [
      { id: 'v2', batchId: 'video-b', source: 'video-watermark', name: 'clip2', extension: 'mp4', progress: 0, status: 'queued' }
    ]);

    const ids = exportStatusStore.getSnapshot().map((task) => task.id).sort();
    expect(ids).toEqual(['other', 'v2']);
  });
});

describe('ExportStatusPanel', () => {
  it('renders real tasks from the store, with summary and error detail', () => {
    exportStatusStore.upsert({ id: 'a', batchId: 'b1', source: 'media-batch', name: '封面', extension: 'jpg', width: 1920, height: 1080, progress: 100, status: 'completed' });
    exportStatusStore.upsert({ id: 'b', batchId: 'b1', source: 'media-batch', name: '头图', extension: 'png', progress: 42, status: 'failed', error: '磁盘已满' });
    exportStatusStore.upsert({ id: 'c', batchId: 'b1', source: 'media-batch', name: '图标', extension: 'png', progress: 0, status: 'queued' });

    act(() => {
      root.render(<ExportStatusPanel />);
    });

    // 全局导出中心的默认标题与收起按钮 aria-label。
    expect(container.querySelector('.export-status-title span')?.textContent).toBe('导出中心');
    expect(container.querySelector('button[aria-label="收起导出中心"]')).not.toBeNull();

    expect(container.textContent).toContain('封面.jpg');
    expect(container.textContent).toContain('已完成');
    expect(container.textContent).toContain('失败');
    expect(container.textContent).toContain('排队中');
    expect(container.textContent).toContain('磁盘已满');
    expect(container.textContent).toContain('Logo 与版式');
    expect(container.querySelector('.export-center-progress')).not.toBeNull();
    expect(container.querySelector('.export-progress')).toBeNull();
  });

  it('keeps failed work visible in the collapsed capsule', () => {
    exportStatusStore.upsert({ id: 'failed', batchId: 'b1', source: 'image-watermark', name: '失败图', extension: 'png', progress: 40, status: 'failed', error: '磁盘已满' });
    act(() => { root.render(<ExportStatusPanel />); });

    const close = container.querySelector<HTMLButtonElement>('button[aria-label="收起导出中心"]')!;
    act(() => { close.click(); });

    expect(container.textContent).toContain('1 失败');
  });

  it('shows a cancelled task with the cancelled label', () => {
    exportStatusStore.upsert({ id: 'd', batchId: 'b1', source: 'video-watermark', name: '片段', extension: 'mp4', progress: 0, status: 'cancelled' });
    // A live task keeps the panel expanded so terminal badges are visible.
    exportStatusStore.upsert({ id: 'e', batchId: 'b2', source: 'image-watermark', name: '进行中', extension: 'png', progress: 10, status: 'exporting' });

    act(() => {
      root.render(<ExportStatusPanel />);
    });

    expect(container.textContent).toContain('已取消');
  });

  it('filters hidden task sources from display without removing them from the store', () => {
    exportStatusStore.upsert({ id: 'v1', batchId: 'video-b', source: 'video-watermark', name: '片段', extension: 'mp4', progress: 0, status: 'queued' });
    exportStatusStore.upsert({ id: 'm1', batchId: 'media-b', source: 'media-batch', name: '封面', extension: 'jpg', progress: 0, status: 'queued' });

    act(() => {
      root.render(<ExportStatusPanel hiddenSources={['video-watermark']} />);
    });

    expect(container.textContent).toContain('封面');
    expect(container.textContent).not.toContain('片段');
    // 仅显示层过滤：被隐藏的任务仍留在 store，离开视频页后恢复可见。
    expect(exportStatusStore.getSnapshot()).toHaveLength(2);
  });

  it('keeps other module tasks visible and counted while the video source is hidden', () => {
    exportStatusStore.upsert({ id: 'v1', batchId: 'video-b', source: 'video-watermark', name: '片段', extension: 'mp4', progress: 0, status: 'queued' });
    exportStatusStore.upsert({ id: 'm1', batchId: 'media-b', source: 'media-batch', name: '封面', extension: 'jpg', progress: 0, status: 'queued' });

    act(() => {
      root.render(<ExportStatusPanel hiddenSources={['video-watermark']} />);
    });
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="收起导出中心"]')!;
    act(() => { close.click(); });

    expect(container.textContent).toContain('导出中心');
    expect(container.querySelector('.export-status-toggle-count')?.textContent).toBe('1');
    expect(container.textContent).not.toContain('片段');
  });

  it('renders nothing when every task belongs to a hidden source', () => {
    exportStatusStore.upsert({ id: 'v1', batchId: 'video-b', source: 'video-watermark', name: '片段', extension: 'mp4', progress: 0, status: 'queued' });

    act(() => {
      root.render(<ExportStatusPanel hiddenSources={['video-watermark']} />);
    });

    expect(container.querySelector('.export-status-panel')).toBeNull();
    expect(container.querySelector('.export-status-toggle')).toBeNull();
  });

  it('renders nothing when a prop change hides every task while the panel is open, then reappears', () => {
    exportStatusStore.upsert({ id: 'v1', batchId: 'video-b', source: 'video-watermark', name: '片段', extension: 'mp4', progress: 0, status: 'queued' });

    act(() => {
      root.render(<ExportStatusPanel />);
    });

    // 面板已打开且任务可见。
    expect(container.querySelector('.export-status-panel')).not.toBeNull();
    expect(container.textContent).toContain('片段');

    act(() => {
      root.render(<ExportStatusPanel hiddenSources={['video-watermark']} />);
    });

    // 全隐藏后不渲染空浮层，也不渲染胶囊。
    expect(container.querySelector('.export-status-panel')).toBeNull();
    expect(container.querySelector('.export-status-toggle')).toBeNull();
    expect(container.textContent).not.toContain('片段');

    act(() => {
      root.render(<ExportStatusPanel />);
    });

    // 来源恢复可见后任务重新出现，自动展开行为可再次发生。
    expect(container.querySelector('.export-status-panel')).not.toBeNull();
    expect(container.textContent).toContain('片段');
  });

  it('clears only visible terminal tasks, leaving hidden terminal tasks in the store', () => {
    exportStatusStore.upsert({ id: 'v1', batchId: 'video-b', source: 'video-watermark', name: '片段', extension: 'mp4', progress: 100, status: 'completed' });
    exportStatusStore.upsert({ id: 'm1', batchId: 'media-b', source: 'media-batch', name: '封面', extension: 'jpg', progress: 100, status: 'completed' });

    act(() => {
      root.render(<ExportStatusPanel hiddenSources={['video-watermark']} />);
    });

    const clear = container.querySelector<HTMLButtonElement>('.export-status-clear')!;
    expect(clear).not.toBeNull();
    expect(clear.disabled).toBe(false);

    act(() => { clear.click(); });

    // 仅移除可见的媒体任务，隐藏的视频任务保留。
    expect(exportStatusStore.getSnapshot().map((task) => task.id).sort()).toEqual(['v1']);
  });

  it('does not reopen on progress or member changes in an already-seen batch after manual collapse', () => {
    exportStatusStore.upsert({ id: 'a', batchId: 'b1', source: 'media-batch', name: '封面', extension: 'jpg', progress: 0, status: 'queued' });

    act(() => { root.render(<ExportStatusPanel />); });
    expect(container.querySelector('.export-status-panel')).not.toBeNull();

    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="收起导出中心"]')!.click(); });
    expect(container.querySelector('.export-status-toggle')).not.toBeNull();
    expect(container.querySelector('.export-status-panel')).toBeNull();

    // 同一批次新增成员 + 进度推进，都不得再次自动展开。
    act(() => {
      exportStatusStore.upsert({ id: 'b', batchId: 'b1', source: 'media-batch', name: '头图', extension: 'png', progress: 0, status: 'queued' });
      exportStatusStore.patch('a', { status: 'exporting', progress: 40 });
    });

    expect(container.querySelector('.export-status-toggle')).not.toBeNull();
    expect(container.querySelector('.export-status-panel')).toBeNull();
  });

  it('reopens for a truly new batch after manual collapse', () => {
    exportStatusStore.upsert({ id: 'a', batchId: 'b1', source: 'media-batch', name: '封面', extension: 'jpg', progress: 0, status: 'queued' });

    act(() => { root.render(<ExportStatusPanel />); });
    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="收起导出中心"]')!.click(); });
    expect(container.querySelector('.export-status-toggle')).not.toBeNull();

    act(() => {
      exportStatusStore.upsert({ id: 'c', batchId: 'b2', source: 'image-watermark', name: '新批次图', extension: 'png', progress: 0, status: 'queued' });
    });

    expect(container.querySelector('.export-status-panel')).not.toBeNull();
  });

  it('reopens on a new failure even after manual collapse', () => {
    exportStatusStore.upsert({ id: 'a', batchId: 'b1', source: 'media-batch', name: '封面', extension: 'jpg', progress: 0, status: 'exporting' });

    act(() => { root.render(<ExportStatusPanel />); });
    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="收起导出中心"]')!.click(); });
    expect(container.querySelector('.export-status-toggle')).not.toBeNull();

    act(() => {
      exportStatusStore.upsert({ id: 'd', batchId: 'b1', source: 'media-batch', name: '头图', extension: 'png', progress: 40, status: 'failed', error: '磁盘已满' });
    });

    expect(container.querySelector('.export-status-panel')).not.toBeNull();
    expect(container.textContent).toContain('磁盘已满');
  });

  it('force-opens on an explicit requestOpen even for an already-seen batch', () => {
    exportStatusStore.upsert({ id: 'a', batchId: 'b1', source: 'image-watermark', name: '图', extension: 'png', progress: 0, status: 'queued' });

    act(() => { root.render(<ExportStatusPanel />); });
    act(() => { container.querySelector<HTMLButtonElement>('button[aria-label="收起导出中心"]')!.click(); });
    expect(container.querySelector('.export-status-toggle')).not.toBeNull();
    expect(container.querySelector('.export-status-panel')).toBeNull();

    // 同一批次不会因进度/成员变化重新展开，但显式 requestOpen 必须强制展开。
    act(() => { exportStatusStore.requestOpen(); });

    expect(container.querySelector('.export-status-panel')).not.toBeNull();
  });

  it('shows a reveal action only for completed tasks with a real native output path and reveals that exact path', () => {
    const onReveal = vi.fn();
    exportStatusStore.upsert({ id: 'a', batchId: 'b1', source: 'media-batch', name: '封面', extension: 'jpg', progress: 100, status: 'completed', outputPath: '/tmp/中文 空格/封面_2.jpg' });
    exportStatusStore.upsert({ id: 'b', batchId: 'b1', source: 'media-batch', name: '头图', extension: 'png', progress: 100, status: 'completed', outputPath: '头图.png' });
    exportStatusStore.upsert({ id: 'c', batchId: 'b1', source: 'media-batch', name: '图标', extension: 'png', progress: 40, status: 'exporting' });

    act(() => { root.render(<ExportStatusPanel onReveal={onReveal} />); });

    const revealButtons = container.querySelectorAll<HTMLButtonElement>('.export-task-reveal');
    expect(revealButtons).toHaveLength(1);

    const button = revealButtons[0];
    expect(button.getAttribute('aria-label')).toBe('在文件夹中显示 封面.jpg');
    expect(button.title).toBe('/tmp/中文 空格/封面_2.jpg');

    act(() => { button.click(); });
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenCalledWith('/tmp/中文 空格/封面_2.jpg');
  });

  it('does not show a reveal action for a completed task without a native output path (browser/download)', () => {
    const onReveal = vi.fn();
    exportStatusStore.upsert({ id: 'a', batchId: 'b1', source: 'media-batch', name: '封面', extension: 'jpg', progress: 100, status: 'completed' });

    act(() => { root.render(<ExportStatusPanel onReveal={onReveal} />); });

    expect(container.querySelector('.export-task-reveal')).toBeNull();
  });
});
