import { describe, expect, it } from 'vitest';
import { exportSequentially } from './exportBatch';

describe('exportSequentially', () => {
  it('runs in order, continues after failure, and reports exact progress', async () => {
    const order: number[] = []; const progress: number[] = [];
    const result = await exportSequentially([1, 2, 3], async (item) => {
      order.push(item); if (item === 2) throw new Error('second failed');
      return { info: item === 3 ? 'compressed' : undefined };
    }, (value) => progress.push(value.current));
    expect(order).toEqual([1, 2, 3]);
    expect(progress).toEqual([1, 2, 3]);
    expect(result).toEqual({ completed: 2, failures: [{ item: 2, message: 'second failed' }], info: [{ item: 3, message: 'compressed' }] });
  });
});
