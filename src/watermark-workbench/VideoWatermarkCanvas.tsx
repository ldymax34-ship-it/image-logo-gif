import { useCallback, useEffect, useRef } from 'react';
import type { WatermarkLayerInstance } from '../core/image/watermarkRenderPlan';

export function VideoWatermarkCanvas({
  baseFrameUrl,
  width,
  height,
  layers,
}: {
  baseFrameUrl?: string;
  width: number;
  height: number;
  layers: WatermarkLayerInstance[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<{ url: string; image: CanvasImageSource } | null>(null);
  const layersRef = useRef<WatermarkLayerInstance[]>(layers);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const cached = baseImageRef.current;
    if (cached) {
      context.drawImage(cached.image, 0, 0, canvas.width, canvas.height);
    } else {
      context.fillStyle = '#111418';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    drawLayers(context, layersRef.current);
  }, []);

  // Decode the base frame only when the source frame URL changes. Watermark
  // parameter edits redraw the overlay on the cached frame without re-decoding.
  useEffect(() => {
    let disposed = false;
    if (!baseFrameUrl) {
      baseImageRef.current = null;
      redraw();
      return;
    }
    if (baseImageRef.current?.url === baseFrameUrl) {
      redraw();
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      baseImageRef.current = { url: baseFrameUrl, image };
      redraw();
    };
    image.onerror = () => {
      if (disposed) return;
      baseImageRef.current = null;
      redraw();
    };
    image.src = baseFrameUrl;
    return () => {
      disposed = true;
    };
  }, [baseFrameUrl, redraw]);

  // Parameter changes redraw the overlay on the next frame without touching FFmpeg.
  useEffect(() => {
    redraw();
  }, [layers, redraw]);

  return <canvas ref={canvasRef} width={width} height={height} className="wm-video-canvas" />;
}

function drawLayers(context: CanvasRenderingContext2D, layers: WatermarkLayerInstance[]) {
  for (const layer of layers) {
    if (layer.kind !== 'text') continue;
    context.save();
    context.globalAlpha = layer.opacity;
    context.translate(layer.cx, layer.cy);
    context.rotate(layer.rotation * Math.PI / 180);
    context.font = `500 ${layer.fontSize}px "Source Han Sans SC", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (layer.stroke) {
      context.strokeStyle = layer.stroke.color;
      context.lineWidth = layer.stroke.width;
      context.lineJoin = 'round';
      context.strokeText(layer.text, 0, 0);
    }
    context.fillStyle = layer.color;
    context.fillText(layer.text, 0, 0);
    context.restore();
  }
}
