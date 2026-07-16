import { useState } from 'react';
import { chooseOutputTarget } from '../../platform/fileSystem';
import { exportMediaBatch, type BatchProgress, type BatchResult, type MediaExportRequest, type MediaExportRow } from '../../services/export';

export function useBatchExportController() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<BatchResult<MediaExportRow>>();

  async function run(request: Omit<MediaExportRequest, 'outputTarget' | 'onProgress'>) {
    if (exporting || !request.rows.length) return undefined;
    const outputTarget = await chooseOutputTarget();
    if (outputTarget.kind === 'cancelled') return undefined;
    setErrorMessage('');
    setExporting(true);
    setProgress({ current: 0, total: request.rows.length });
    try {
      const nextResult = await exportMediaBatch({ ...request, outputTarget, onProgress: setProgress });
      setResult(nextResult);
      if (nextResult.failures.length) setErrorMessage(`已导出 ${nextResult.completed} 个文件，${nextResult.failures.length} 个失败。${nextResult.failures[0].message}`);
      return nextResult;
    } finally {
      setExporting(false);
    }
  }

  return { exporting, progress, errorMessage, result, run };
}
