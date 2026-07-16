import { describe, expect, it } from 'vitest';
import { exportSequentially } from './exportBatch';

describe('exportSequentially', () => {
  it('runs in order, continues after failure, and reports exact progress', async () => {
    const order: number[] = []; const progress: number[] = [];
    const result = await exportSequentially([1, 2, 3], async (item) => {
      order.push(item); if (item === 2) throw new Error('second failed');
      return item === 3 ? { result: 'compressed' as const, outputBytes: 1024 } : { result: 'success' as const, outputBytes: 1024 };
    }, (value) => progress.push(value.current));
    expect(order).toEqual([1, 2, 3]);
    expect(progress).toEqual([1, 2, 3]);
    expect(result).toEqual({ completed: 2, failures: [{ item: 2, message: 'second failed' }], outcomes: [{ item: 1, outcome: { result: 'success', outputBytes: 1024 } }, { item: 2, outcome: { result: 'failed', reason: 'second failed' } }, { item: 3, outcome: { result: 'compressed', outputBytes: 1024 } }] });
  });
});
