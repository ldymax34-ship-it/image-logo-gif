export type BatchProgress = { current: number; total: number };
export async function exportSequentially<T>(items: T[], run: (item: T) => Promise<void>, onProgress?: (progress: BatchProgress) => void) {
  for (let index = 0; index < items.length; index += 1) { await run(items[index]); onProgress?.({ current: index + 1, total: items.length }); }
}
