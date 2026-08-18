import type { ExportTask, ExportTaskSource, ExportTaskStatus } from './ExportStatus';

export type ExportTaskListener = (tasks: ExportTask[]) => void;

export function formatExportSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Generates a unique batch id for one export run, without a runtime dependency. */
export function createExportBatchId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

const TERMINAL_STATUSES: ReadonlySet<ExportTaskStatus> = new Set(['completed', 'failed', 'cancelled']);

function isTerminal(status: ExportTaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

const tasks = new Map<string, ExportTask>();
const listeners = new Set<ExportTaskListener>();
const revealListeners = new Set<() => void>();

function emit(): void {
  const snapshot = [...tasks.values()];
  for (const listener of listeners) listener(snapshot);
}

/**
 * Terminal-state protection: once a task reaches completed / failed / cancelled,
 * a later (possibly stale) event can never change its terminal result or reduce
 * its progress. Updates within the same terminal result may still add metadata.
 */
function mergeTask(existing: ExportTask | undefined, incoming: ExportTask): ExportTask {
  if (!existing) return incoming;
  if (isTerminal(existing.status) && incoming.status !== existing.status) {
    return existing;
  }
  return {
    ...existing,
    ...incoming,
    progress: Math.max(existing.progress, incoming.progress)
  };
}

/**
 * 全局导出任务注册表（模块级单例）：各导出流程写入真实状态，
 * ExportStatusPanel 订阅渲染。与 toastBus 同一套事件模式。
 *
 * 批次安全：所有批量写入都按 batchId / source 归属；本表不提供会覆盖其他
 * 工作台任务的全局 replace。resetForTests() 仅用于测试隔离，生产流程只使用
 * clearBatch / clearFinished / remove。
 */
export const exportStatusStore = {
  upsert(task: ExportTask): void {
    tasks.set(task.id, mergeTask(tasks.get(task.id), task));
    emit();
  },
  patch(id: string, patch: Partial<ExportTask>): void {
    const existing = tasks.get(id);
    if (!existing) return;
    tasks.set(id, mergeTask(existing, { ...existing, ...patch }));
    emit();
  },
  remove(id: string): void {
    tasks.delete(id);
    emit();
  },
  /**
   * Reconciles the store's membership for one batch against `next`, then upserts
   * each task (with terminal-state protection). Used by the locally-controlled
   * video queue to mirror its state without ever touching other batches.
   */
  syncBatch(batchId: string, next: ExportTask[]): void {
    const nextIds = new Set(next.map((task) => task.id));
    for (const [id, task] of tasks) {
      if (task.batchId === batchId && !nextIds.has(id)) tasks.delete(id);
    }
    for (const task of next) tasks.set(task.id, mergeTask(tasks.get(task.id), task));
    emit();
  },
  /** 仅清空某个批次自己的任务（新一轮导出/队列替换时使用）。 */
  clearBatch(batchId: string): void {
    let changed = false;
    for (const [id, task] of tasks) {
      if (task.batchId === batchId) {
        tasks.delete(id);
        changed = true;
      }
    }
    if (changed) emit();
  },
  /** 只移除 completed / failed / cancelled 任务，可选按来源限定。 */
  clearFinished(source?: ExportTaskSource): void {
    let changed = false;
    for (const [id, task] of tasks) {
      if (source && task.source !== source) continue;
      if (isTerminal(task.status)) {
        tasks.delete(id);
        changed = true;
      }
    }
    if (changed) emit();
  },
  /** 测试隔离专用：清空整张任务表。生产流程不得调用。 */
  resetForTests(): void {
    revealListeners.clear();
    if (tasks.size === 0) return;
    tasks.clear();
    emit();
  },
  /**
   * 显式请求全局导出中心展开并聚焦。图片水印导出在 OS 输出选择器返回、
   * 任务已注册后调用，避免只依赖「新 batch 自动展开」的隐式启发。
   * 与任务订阅分开：这不是任务状态，只是面板的一次性可见性请求。
   */
  requestOpen(): void {
    for (const listener of revealListeners) listener();
  },
  /** 订阅显式展开请求；面板用它打开并聚焦/滚动到可见位置。 */
  subscribeReveal(listener: () => void): () => void {
    revealListeners.add(listener);
    return () => {
      revealListeners.delete(listener);
    };
  },
  /** 只读快照，便于测试与调试。 */
  getSnapshot(): ExportTask[] {
    return [...tasks.values()];
  },
  subscribe(listener: ExportTaskListener): () => void {
    listeners.add(listener);
    listener([...tasks.values()]);
    return () => {
      listeners.delete(listener);
    };
  }
};
