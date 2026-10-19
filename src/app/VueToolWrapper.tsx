import { useEffect, useRef } from 'react';
import { ToolPageHeader } from '../components';

const PAGE_COPY: Record<string, { title: string; description: string }> = {
  'gif-compress': {
    title: '视频转 GIF',
    description: '截取单个 MP4 / MOV 片段，设置输出宽度与帧率，预览并导出不超过 8 MB 的 GIF。',
  },
  'image-compress': {
    title: '图片压缩',
    description: '单张图片本地再编码，对比压缩前后画质与体积，另存新文件、不覆盖原图。',
  },
  'watermark-trace': {
    title: '水印与追溯',
    description: '为图片与视频批量添加可见水印，不覆盖原文件。',
  },
};

type VueToolWrapperProps = {
  mountKey: string;
  onReturn: () => void;
  onOpenChangelog?: () => void;
};

/**
 * Mounts a Vue 3 app into a React-managed div.
 */
export function VueToolWrapper({ mountKey, onReturn, onOpenChangelog }: VueToolWrapperProps) {
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
      } else if (mountKey === 'image-compress') {
        const mod = await import('../image-tool/main');
        createFn = mod.createImageToolApp;
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
        title={PAGE_COPY[mountKey]?.title ?? '水印与追溯'}
        description={PAGE_COPY[mountKey]?.description ?? '为图片与视频批量添加可见水印，不覆盖原文件。'}
        status={mountKey === 'watermark-trace' ? 'experimental' : 'available'}
        onReturn={mountKey === 'image-compress' ? onReturn : () => window.dispatchEvent(new CustomEvent('gif-tool-request-return'))}
        onOpenChangelog={onOpenChangelog}
      />
      <div ref={containerRef} className="embedded-tool-container" />
    </div>
  );
}
