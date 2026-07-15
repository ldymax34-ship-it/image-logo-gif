export type BatchProgress = { current: number; total: number };
export type BatchFailure<T> = { item: T; message: string };
export type BatchInfo<T> = { item: T; message: string };
export type BatchResult<T> = { completed: number; failures: BatchFailure<T>[]; info: BatchInfo<T>[] };

export async function exportSequentially<T>(
  items: T[],
  run: (item: T) => Promise<{ info?: string }>,
  onProgress?: (progress: BatchProgress) => void
): Promise<BatchResult<T>> {
  const failures: BatchFailure<T>[] = [];
  const info: BatchInfo<T>[] = [];
  let completed = 0;
  for (let index = 0; index < items.length; index += 1) {
    try {
      const outcome = await run(items[index]);
      completed += 1;
      if (outcome.info) info.push({ item: items[index], message: outcome.info });
    } catch (error) {
      failures.push({ item: items[index], message: error instanceof Error ? error.message : '导出失败' });
    }
    onProgress?.({ current: index + 1, total: items.length });
  }
  return { completed, failures, info };
}
