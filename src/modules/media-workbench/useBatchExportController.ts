import { useState } from 'react';
import { exportSequentially, type BatchItemOutcome, type BatchProgress, type BatchResult } from '../../services/export';

export function useBatchExportController<T>() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<BatchResult<T>>();
  async function run(items: T[], runItem: (item: T) => Promise<BatchItemOutcome>) {
    if (exporting || !items.length) return undefined;
    setErrorMessage(''); setExporting(true); setProgress({ current: 0, total: items.length });
    const nextResult = await exportSequentially(items, runItem, setProgress);
    setExporting(false);
    setResult(nextResult);
    if (nextResult.failures.length) setErrorMessage(`已导出 ${nextResult.completed} 个文件，${nextResult.failures.length} 个失败。${nextResult.failures[0].message}`);
    return nextResult;
  }
  return { exporting, progress, errorMessage, result, run };
}
