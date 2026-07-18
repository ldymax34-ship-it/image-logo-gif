import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import type { UpdateAdapter, UpdateHandle } from './updateTypes';

/** Desktop-only adapter. Dynamic imports ensure web development never loads updater APIs. */
export function createTauriUpdateAdapter(): UpdateAdapter {
  return {
    isAvailable: () => isDesktopBridgeAvailable(),
    async check() {
      if (!isDesktopBridgeAvailable()) return null;
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check({ timeout: 12_000 });
      if (!update) return null;
      const handle: UpdateHandle = {
        version: update.version,
        date: update.date,
        notes: update.body,
        download: async (onProgress) => {
          let received = 0;
          await update.download((event) => {
            if (event.event === 'Started') onProgress({ received, total: event.data.contentLength });
            if (event.event === 'Progress') { received += event.data.chunkLength; onProgress({ received }); }
          }, { timeout: 120_000 });
        },
        install: () => update.install(),
        close: () => update.close()
      };
      return handle;
    },
    restart: async () => {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    }
  };
}
