import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, X } from 'lucide-react';
import { ExportSummary } from './ExportSummary';
import { ExportTaskItem } from './ExportTaskItem';
import { exportStatusStore } from './exportStatusStore';
import { notify } from '../ui/toastBus';
import { revealPathInFolder } from '../../platform/fileSystem';
import type { ExportTask, ExportTaskSource } from './ExportStatus';
import './exportStatus.css';

export type ExportStatusPanelProps = {
  title?: string;
  className?: string;
  /**
   * 仅用于展示层的来源过滤：被隐藏来源的任务不渲染、不计入胶囊与汇总，
   * 但不会从 store 移除，离开视频页后恢复可见并继续更新。
   */
  hiddenSources?: ExportTaskSource[];
  /** 覆写「在文件夹中显示」动作（默认走桌面 opener；测试可注入）。 */
  onReveal?: (path: string) => void;
};

const TERMINAL_STATUSES: readonly ExportTask['status'][] = ['completed', 'failed', 'cancelled'];

/**
 * 导出状态面板：只订阅全局 exportStatusStore，展示各导出流程写入的真实任务状态。
 * 自动展开语义：新 batchId 第一次出现或出现新失败时展开；同一已存在批次的
 * 进度/成员变化不反复打断用户主动收起。
 */
export function ExportStatusPanel({ title = '导出中心', className = '', hiddenSources, onReveal }: ExportStatusPanelProps) {
  const [tasks, setTasks] = useState<ExportTask[]>([]);
  const [open, setOpen] = useState(false);
  const seenBatchIds = useRef(new Set<string>());
  const prevFailed = useRef(0);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => exportStatusStore.subscribe(setTasks), []);

  const reveal = useCallback(async (path: string) => {
    if (onReveal) {
      onReveal(path);
      return;
    }
    try {
      await revealPathInFolder(path);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    }
  }, [onReveal]);

  // 显式展开请求（图片水印导出等）：展开并把面板焦点/滚动到可见位置，
  // 与「新 batch 自动展开」的隐式启发解耦，也不依赖用户是否此前手动收起。
  useEffect(() => exportStatusStore.subscribeReveal(() => {
    setOpen(true);
    requestAnimationFrame(() => {
      panelRef.current?.focus();
      panelRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }), []);

  const visibleTasks = useMemo(
    () => hiddenSources?.length ? tasks.filter((task) => !hiddenSources.includes(task.source)) : tasks,
    [tasks, hiddenSources]
  );

  const activeCount = useMemo(
    () => visibleTasks.filter((task) => task.status === 'exporting' || task.status === 'queued').length,
    [visibleTasks]
  );
  const failedCount = useMemo(() => visibleTasks.filter((task) => task.status === 'failed').length, [visibleTasks]);

  useEffect(() => {
    let hasNewBatch = false;
    for (const task of visibleTasks) {
      if (!seenBatchIds.current.has(task.batchId)) hasNewBatch = true;
      seenBatchIds.current.add(task.batchId);
    }
    const hasNewFailure = failedCount > prevFailed.current;
    if (hasNewBatch || hasNewFailure) setOpen(true);
    prevFailed.current = failedCount;
  }, [visibleTasks, failedCount]);

  const clearVisibleFinished = () => {
    for (const task of visibleTasks) {
      if (TERMINAL_STATUSES.includes(task.status)) {
        exportStatusStore.remove(task.id);
      }
    }
  };

  // 全隐藏时（无论面板此前是否已展开）都不渲染空浮层。
  if (visibleTasks.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="export-status-toggle" onClick={() => setOpen(true)} aria-label="展开导出中心">
        <Gauge size={14} aria-hidden="true" />
        导出中心
        {activeCount > 0 ? <span className="export-status-toggle-count">{activeCount}</span> : null}
        {activeCount === 0 && failedCount > 0 ? <span className="export-status-toggle-count is-failed">{failedCount} 失败</span> : null}
      </button>
    );
  }

  return (
    <section ref={panelRef} tabIndex={-1} className={`export-status-panel ${className}`.trim()} aria-label={title}>
      <header className="export-status-head">
        <div className="export-status-title">
          <Gauge size={16} aria-hidden="true" className="export-status-head-icon" />
          <span>{title}</span>
          {activeCount > 0 ? <span className="export-status-live">{activeCount} 进行中</span> : null}
        </div>
        <button type="button" className="export-status-close" onClick={() => setOpen(false)} aria-label="收起导出中心" title="收起">
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      <ExportSummary tasks={visibleTasks} />

      {visibleTasks.length ? (
        <ul className="export-task-list">
          {visibleTasks.map((task) => (
            <ExportTaskItem key={task.id} task={task} onReveal={reveal} />
          ))}
        </ul>
      ) : (
        <div className="export-task-empty">暂无导出任务</div>
      )}

      <footer className="export-status-foot">
        <span className="export-status-hint">任务在本机执行</span>
        <button
          type="button"
          className="export-status-clear"
          onClick={clearVisibleFinished}
          disabled={!visibleTasks.some((task) => TERMINAL_STATUSES.includes(task.status))}
        >
          清除已结束
        </button>
      </footer>
    </section>
  );
}
