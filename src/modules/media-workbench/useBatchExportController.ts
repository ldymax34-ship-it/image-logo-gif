import { useState } from 'react';
import { chooseOutputTarget, joinNativePath } from '../../platform/fileSystem';
import { exportMediaBatch, type BatchProgress, type BatchResult, type ExportJob, type MediaExportRequest } from '../../services/export';
import { createExportBatchId, exportStatusStore, formatExportSize } from '../../components/export-status/exportStatusStore';
import { notify } from '../../components/ui/toastBus';
import type { ExportTask } from '../../components/export-status/ExportStatus';

function jobToExportTask(job: ExportJob, batchId: string, fallbackExtension: string): ExportTask {
  const dot = job.plannedFileName.lastIndexOf('.');
  const name = dot > 0 ? job.plannedFileName.slice(0, dot) : job.plannedFileName;
  const extension = dot > 0 ? job.plannedFileName.slice(dot + 1) : fallbackExtension;
  return {
    id: `${batchId}:${job.id}`,
    batchId,
    source: 'media-batch',
    name,
    extension,
    width: job.specSnapshot.width,
    height: job.specSnapshot.height,
    progress: 0,
    status: 'queued'
  };
}

export type BatchExportCallbacks = {
  onExportingChange?: (exporting: boolean) => void;
};

/**
 * Drives a media batch export from the dialog, but returns as soon as the OS
 * output target is accepted and tasks are registered — so the caller can close
 * the dialog and hand the remaining progress to the global export center. The
 * batch itself continues in the background; completion/failure notification and
 * the final `onExportingChange(false)` are fired here rather than in the dialog,
 * so they survive the dialog unmounting.
 */
export function useBatchExportController() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<BatchResult<ExportJob>>();

  async function run(
    request: Omit<MediaExportRequest, 'outputTarget' | 'onProgress' | 'onJobStart' | 'onJobResult'>,
    callbacks: BatchExportCallbacks = {}
  ): Promise<boolean> {
    if (exporting || !request.jobs.length) return false;
    const outputTarget = await chooseOutputTarget();
    if (outputTarget.kind === 'cancelled') return false;
    setErrorMessage('');
    setExporting(true);
    callbacks.onExportingChange?.(true);
    setProgress({ current: 0, total: request.jobs.length });

    const batchId = createExportBatchId('media');
    for (const job of request.jobs) exportStatusStore.upsert(jobToExportTask(job, batchId, request.format));

    // 任务已注册后，显式展开并聚焦全局导出中心，避免只依赖隐式的新批次展开。
    exportStatusStore.requestOpen();

    void (async () => {
      try {
        const nextResult = await exportMediaBatch({
          ...request,
          outputTarget,
          onProgress: setProgress,
          onJobStart: (job) => exportStatusStore.patch(`${batchId}:${job.id}`, { status: 'exporting' }),
          onJobResult: (job, _index, outcome) => {
            if (outcome.result === 'failed') {
              exportStatusStore.patch(`${batchId}:${job.id}`, { status: 'failed', error: outcome.reason });
              return;
            }
            const outputPath = outputTarget.kind === 'desktop-directory' && outcome.actualFileName
              ? joinNativePath(outputTarget.path, outcome.actualFileName)
              : undefined;
            exportStatusStore.patch(`${batchId}:${job.id}`, {
              status: 'completed',
              progress: 100,
              size: formatExportSize(outcome.outputBytes),
              outputPath
            });
          }
        });
        setResult(nextResult);
        if (nextResult.failures.length) {
          notify('error', `已导出 ${nextResult.completed} 个文件，${nextResult.failures.length} 个失败：${nextResult.failures[0].message}`);
        } else {
          notify('success', `已导出 ${nextResult.completed} 个文件`);
        }
      } catch (error) {
        notify('error', `导出失败：${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setExporting(false);
        callbacks.onExportingChange?.(false);
      }
    })();

    return true;
  }

  return { exporting, progress, errorMessage, result, run };
}
