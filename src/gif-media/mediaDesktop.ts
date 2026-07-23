import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import type { GifMediaOptions, MediaEngineStatus, MediaTaskEvent } from './mediaTypes';

export type MediaDesktopApi = {
  getEngineStatus: () => Promise<MediaEngineStatus>;
  pickMediaFiles: () => Promise<string[]>;
  pickOutputDirectory: () => Promise<string | null>;
  startGifTask: (request: { taskId: string; inputPath: string; options: GifMediaOptions }) => Promise<{ taskId: string; outputPath: string }>;
  cancelTask: (taskId: string) => Promise<void>;
  listenTaskEvents: (listener: (event: MediaTaskEvent) => void) => Promise<() => void>;
  listenDroppedPaths: (listener: (paths: string[]) => void) => Promise<() => void>;
};

export function isMediaDesktopAvailable(): boolean {
  return isDesktopBridgeAvailable();
}

export async function loadMediaDesktopApi(): Promise<MediaDesktopApi> {
  const [{ invoke }, { listen }, { open }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
    import('@tauri-apps/plugin-dialog')
  ]);

  return {
    getEngineStatus: () => invoke<MediaEngineStatus>('media_engine_status'),
    async pickMediaFiles() {
      const result = await open({
        title: '选择 MP4 或 MOV 文件',
        multiple: true,
        filters: [{ name: '视频文件', extensions: ['mp4', 'mov'] }]
      });
      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    },
    async pickOutputDirectory() {
      const result = await open({ title: '选择 GIF 输出文件夹', directory: true, multiple: false });
      return typeof result === 'string' ? result : null;
    },
    startGifTask: (request) => invoke('start_gif_media_task', { request }),
    cancelTask: (taskId) => invoke('cancel_gif_media_task', { taskId }),
    async listenTaskEvents(listener) {
      return listen<MediaTaskEvent>('gif-media://task', ({ payload }) => listener(payload));
    },
    async listenDroppedPaths(listener) {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      return getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'drop') listener(event.payload.paths);
      });
    }
  };
}
