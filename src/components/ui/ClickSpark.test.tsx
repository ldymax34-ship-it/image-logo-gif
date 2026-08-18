// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickSpark } from './ClickSpark';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ClickSpark', () => {
  it('keeps the canvas passive and preserves child interaction without WebGL', () => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      globalAlpha: 1, strokeStyle: '', lineWidth: 1, lineCap: 'round'
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));

    const onClick = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<ClickSpark><button onClick={onClick}>导出</button></ClickSpark>));

    const canvas = container.querySelector('canvas')!;
    expect(canvas.className).toBe('click-spark-canvas');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    act(() => container.querySelector('button')!.click());
    expect(onClick).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});
