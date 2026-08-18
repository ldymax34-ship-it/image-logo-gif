import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import './ClickSpark.css';

type SparkBurst = {
  x: number;
  y: number;
  startedAt: number;
};

export type ClickSparkProps = {
  children: ReactNode;
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
};

export function ClickSpark({
  children,
  sparkColor = 'rgba(255,255,255,.82)',
  sparkSize = 7,
  sparkRadius = 16,
  sparkCount = 8,
  duration = 360
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const burstsRef = useRef<SparkBurst[]>([]);
  const frameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * ratio);
      canvas.height = Math.round(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const draw = (now: number) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    burstsRef.current = burstsRef.current.filter((burst) => now - burst.startedAt < duration);
    for (const burst of burstsRef.current) {
      const progress = Math.min(1, (now - burst.startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      context.globalAlpha = 1 - progress;
      context.strokeStyle = sparkColor;
      context.lineWidth = 1.25;
      context.lineCap = 'round';
      for (let index = 0; index < sparkCount; index += 1) {
        const angle = (Math.PI * 2 * index) / sparkCount;
        const inner = sparkRadius * .35 * eased;
        const outer = inner + sparkSize * (1 - progress);
        context.beginPath();
        context.moveTo(burst.x + Math.cos(angle) * inner, burst.y + Math.sin(angle) * inner);
        context.lineTo(burst.x + Math.cos(angle) * outer, burst.y + Math.sin(angle) * outer);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    if (burstsRef.current.length) frameRef.current = requestAnimationFrame(draw);
    else frameRef.current = undefined;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas?.getContext('2d')) return;
    burstsRef.current.push({ x: event.clientX, y: event.clientY, startedAt: performance.now() });
    if (frameRef.current == null) frameRef.current = requestAnimationFrame(draw);
  };

  return (
    <div className="click-spark-root" onPointerDown={handlePointerDown}>
      {children}
      <canvas ref={canvasRef} className="click-spark-canvas" aria-hidden="true" />
    </div>
  );
}
