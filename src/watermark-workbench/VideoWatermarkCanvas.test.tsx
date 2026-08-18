// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoWatermarkCanvas } from './VideoWatermarkCanvas';
import type { WatermarkLayerInstance } from '../core/image/watermarkRenderPlan';

type MockImageInstance = { onload: (() => void) | null; onerror: (() => void) | null; src: string };
type RecordedContext = {
  calls: string[];
  fillStyle: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  clearRect: () => void;
  drawImage: () => void;
  fillRect: () => void;
  fillText: (text: string) => void;
  save: () => void;
  restore: () => void;
  translate: () => void;
  rotate: () => void;
};

function makeContext(): RecordedContext {
  const calls: string[] = [];
  return {
    calls,
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    clearRect: () => void calls.push('clearRect'),
    drawImage: () => void calls.push('drawImage'),
    fillRect: () => void calls.push('fillRect'),
    fillText: (text: string) => void calls.push(`fillText:${text}`),
    save: () => void calls.push('save'),
    restore: () => void calls.push('restore'),
    translate: () => void calls.push('translate'),
    rotate: () => void calls.push('rotate'),
  };
}

function textLayer(text: string): WatermarkLayerInstance {
  return {
    id: 'wm:0:0',
    cx: 10,
    cy: 10,
    rotation: 0,
    opacity: 1,
    kind: 'text',
    text,
    fontFamily: 'Source Han Sans SC',
    color: '#fff',
    fontSize: 16,
  };
}

describe('VideoWatermarkCanvas', () => {
  let recorded: RecordedContext;
  let imageInstances: MockImageInstance[];
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    recorded = makeContext();
    imageInstances = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recorded as unknown as CanvasRenderingContext2D);
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
      constructor() {
        imageInstances.push(this);
      }
    }
    vi.stubGlobal('Image', MockImage);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderOnce = async (url: string, layers: WatermarkLayerInstance[]) => {
    await act(async () => { root.render(<VideoWatermarkCanvas baseFrameUrl={url} width={960} height={540} layers={layers} />); });
  };

  it('decodes the base frame once and redraws the overlay without re-decoding on parameter change', async () => {
    await renderOnce('blob:frame-1', [textLayer('第一帧水印')]);
    expect(imageInstances).toHaveLength(1);
    await act(async () => { imageInstances[0].onload?.(); });
    const drawsAfterLoad = recorded.calls.filter((c) => c === 'drawImage').length;
    expect(drawsAfterLoad).toBe(1);
    expect(recorded.calls).toContain('fillText:第一帧水印');

    await renderOnce('blob:frame-1', [textLayer('第二帧水印')]);
    expect(imageInstances).toHaveLength(1);
    expect(recorded.calls).toContain('fillText:第二帧水印');
    expect(recorded.calls.filter((c) => c === 'drawImage').length).toBe(drawsAfterLoad + 1);
  });

  it('re-decodes only when the base frame URL changes', async () => {
    const stable = [textLayer('A')];
    await renderOnce('blob:frame-1', stable);
    await act(async () => { imageInstances[0].onload?.(); });
    expect(imageInstances).toHaveLength(1);
    const drawsBefore = recorded.calls.filter((c) => c === 'drawImage').length;

    await renderOnce('blob:frame-2', stable);
    expect(imageInstances).toHaveLength(2);
    await act(async () => { imageInstances[1].onload?.(); });
    expect(recorded.calls.filter((c) => c === 'drawImage').length).toBe(drawsBefore + 1);
  });

  it('redraws the overlay with the cached frame on every layers change', async () => {
    await renderOnce('blob:frame-1', [textLayer('A'), textLayer('B')]);
    await act(async () => { imageInstances[0].onload?.(); });
    const draws = recorded.calls.filter((c) => c === 'drawImage').length;
    await renderOnce('blob:frame-1', [textLayer('C')]);
    expect(recorded.calls).toContain('fillText:C');
    expect(recorded.calls.filter((c) => c === 'drawImage').length).toBe(draws + 1);
  });
});
