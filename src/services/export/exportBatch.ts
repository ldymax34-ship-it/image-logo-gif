export type BatchProgress = { current: number; total: number };
export type BatchFailure<T> = { item: T; message: string };
export type BatchInfo<T> = { item: T; message: string };
export type BatchResult<T> = { completed: number; failures: BatchFailure<T>[]; info: BatchInfo<T>[] };
export type BatchItemOutcome = { result: 'success' | 'compressed'; beforeBytes?: number; outputBytes: number };

export async function exportSequentially<T>(
  items: T[],
  run: (item: T) => Promise<BatchItemOutcome>,
  onProgress?: (progress: BatchProgress) => void
): Promise<BatchResult<T>> {
  const failures: BatchFailure<T>[] = [];
  const info: BatchInfo<T>[] = [];
  let completed = 0;
  for (let index = 0; index < items.length; index += 1) {
    try {
      const outcome = await run(items[index]);
      completed += 1;
      if (outcome.result === 'compressed') info.push({ item: items[index], message: `已自动压缩至 ${(outcome.outputBytes / (1024 * 1024)).toFixed(2)} MB` });
    } catch (error) {
      failures.push({ item: items[index], message: error instanceof Error ? error.message : '导出失败' });
    }
    onProgress?.({ current: index + 1, total: items.length });
  }
  return { completed, failures, info };
}
