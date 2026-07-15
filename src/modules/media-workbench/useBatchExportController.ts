import { useState } from 'react';
import { exportSequentially, type BatchProgress } from '../../services/export';

export function useBatchExportController<T>(runItem: (item: T) => Promise<{ info?: string }>) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  async function run(items: T[]) {
    if (exporting || !items.length) return undefined;
    setErrorMessage(''); setExporting(true); setProgress({ current: 0, total: items.length });
    const result = await exportSequentially(items, runItem, setProgress);
    setExporting(false);
    if (result.failures.length) setErrorMessage(`已导出 ${result.completed} 个文件，${result.failures.length} 个失败。${result.failures[0].message}`);
    return result;
  }
  return { exporting, progress, errorMessage, run };
}
