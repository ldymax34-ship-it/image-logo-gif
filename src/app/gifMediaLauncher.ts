import { isDesktopBridgeAvailable } from '../platform/desktopBridge';

export type GifMediaWindow = {
  show: () => Promise<void>;
  setFocus: () => Promise<void>;
  close: () => Promise<void>;
};

export function returnToToolbox(navigate?: (url: string) => void): void {
  const nav = navigate ?? ((url: string) => window.location.assign(url));
  nav('/');
}

export async function closeGifMediaPreview(options: {
  isDesktop?: boolean;
  navigate?: (url: string) => void;
  desktopWindow?: Pick<GifMediaWindow, 'close'>;
} = {}): Promise<'browser-returned' | 'desktop-closed'> {
  if (options.isDesktop ?? isDesktopBridgeAvailable()) {
    if (options.desktopWindow) {
      await options.desktopWindow.close();
      return 'desktop-closed';
    }
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      (getCurrentWebviewWindow() as Pick<GifMediaWindow, 'close'>).close();
      return 'desktop-closed';
    } catch {
      returnToToolbox(options.navigate);
      return 'browser-returned';
    }
  }
  returnToToolbox(options.navigate);
  return 'browser-returned';
}
