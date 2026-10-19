import type { EncodeInput, EncodeResultMessage, EncodedImage } from './types';

export type Encoder = {
  encode(input: EncodeInput): Promise<EncodedImage>;
  dispose(): void;
};

type Pending = {
  resolve: (value: EncodedImage) => void;
  reject: (reason: Error) => void;
};

/**
 * 单例 worker 客户端：每次编码带唯一 id，结果只回给对应的 Promise。
 * 组件侧仍用代次（generation）丢弃过期结果，这里只负责传输与错误转换。
 */
export function createWorkerEncoder(): Encoder {
  const worker = new Worker(new URL('./codecs.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let disposed = false;

  function rejectAll(reason: string) {
    for (const entry of pending.values()) entry.reject(new Error(reason));
    pending.clear();
  }

  worker.onmessage = (event: MessageEvent<EncodeResultMessage>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) {
      entry.resolve({
        bytes: new Uint8Array(message.bytes),
        width: message.width,
        height: message.height,
        mime: message.mime,
      });
      return;
    }
    entry.reject(new Error(message.error));
  };

  worker.onerror = (event) => {
    const message = event.message || '图片编码器运行失败';
    worker.onerror = null;
    rejectAll(message);
  };

  return {
    encode(input: EncodeInput): Promise<EncodedImage> {
      if (disposed) return Promise.reject(new Error('图片编码器已关闭'));
      const id = nextId++;
      return new Promise<EncodedImage>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, input }, [input.data]);
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      rejectAll('已取消编码');
      worker.terminate();
    },
  };
}
