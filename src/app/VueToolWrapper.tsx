import { useEffect, useRef } from 'react';
import { ToolPageHeader } from '../components';

type VueToolWrapperProps = {
  mountKey: string;
  onReturn: () => void;
};

/**
 * Mounts a Vue 3 app into a React-managed div.
 */
export function VueToolWrapper({ mountKey, onReturn }: VueToolWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<{ unmount: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handleReturn = () => onReturn();
    window.addEventListener('gif-tool-confirmed-return', handleReturn);

    async function mount() {
      if (!containerRef.current) return;

      let createFn: () => { mount: (el: string | Element) => void; unmount: () => void };

      if (mountKey === 'gif-compress') {
        const mod = await import('../gif-tool/main');
        createFn = mod.createGifToolApp;
      } else if (mountKey === 'watermark-trace') {
        const mod = await import('../watermark-tool/main');
        createFn = mod.createWatermarkToolApp;
      } else {
        return;
      }

      if (cancelled) return;
      const app = createFn();
      app.mount(containerRef.current);
      appRef.current = app;
    }

    mount();

    return () => {
      cancelled = true;
      window.removeEventListener('gif-tool-confirmed-return', handleReturn);
      appRef.current?.unmount();
    };
  }, [mountKey]);

  return (
    <div className="embedded-tool-wrapper">
      <ToolPageHeader
        title={mountKey === 'gif-compress' ? 'GIF 合成与压缩' : '水印与追溯'}
        description={mountKey === 'gif-compress'
          ? '截取视频片段、预览压缩结果，并自动控制在 8MB 以内。'
          : '为图片与视频批量添加可见水印，不覆盖原文件。'}
        status={mountKey === 'gif-compress' ? 'available' : 'experimental'}
        onReturn={() => window.dispatchEvent(new CustomEvent('gif-tool-request-return'))}
      />
      <div ref={containerRef} className="embedded-tool-container" />
    </div>
  );
}
