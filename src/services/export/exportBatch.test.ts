import { describe, expect, it } from 'vitest';
import { exportSequentially } from './exportBatch';

describe('exportSequentially', () => {
  it('runs in order, continues after failure, and reports exact progress', async () => {
    const order: number[] = []; const progress: number[] = [];
    const result = await exportSequentially([1, 2, 3], async (item) => {
      order.push(item); if (item === 2) throw new Error('second failed');
      return item === 3 ? { result: 'compressed' as const, outputBytes: 1024 } : { result: 'success' as const, outputBytes: 1024 };
    }, { onProgress: (value) => progress.push(value.current) });
    expect(order).toEqual([1, 2, 3]);
    expect(progress).toEqual([1, 2, 3]);
    expect(result).toEqual({ completed: 2, failures: [{ item: 2, message: 'second failed' }], outcomes: [{ item: 1, outcome: { result: 'success', outputBytes: 1024 } }, { item: 2, outcome: { result: 'failed', reason: 'second failed' } }, { item: 3, outcome: { result: 'compressed', outputBytes: 1024 } }] });
  });

  it('emits per-item start and result lifecycle events in order', async () => {
    const started: number[] = [];
    const results: Array<{ item: number; result: string }> = [];

    await exportSequentially([1, 2], async (item) => {
      if (item === 2) throw new Error('boom');
      return { result: 'success' as const, outputBytes: 42 };
    }, {
      onItemStart: (item) => started.push(item),
      onItemResult: (item, _index, outcome) => results.push({ item, result: outcome.result })
    });

    expect(started).toEqual([1, 2]);
    expect(results).toEqual([
      { item: 1, result: 'success' },
      { item: 2, result: 'failed' }
    ]);
  });
});
