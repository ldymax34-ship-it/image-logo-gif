import { isDesktopBridgeAvailable } from '../platform/desktopBridge';

export const GIF_MEDIA_PAGE_PATH = '/gif-media.html';
export const GIF_MEDIA_WINDOW_LABEL = 'gif-media-preview';

export type GifMediaWindow = {
  show: () => Promise<void>;
  setFocus: () => Promise<void>;
  close: () => Promise<void>;
};

export type GifMediaWindowApi = {
  getByLabel: (label: string) => Promise<GifMediaWindow | null>;
  create: (label: string, options: {
    title: string;
    url: string;
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    resizable: boolean;
  }) => GifMediaWindow;
};

export type GifMediaLaunchOptions = {
  isDesktop?: boolean;
  navigate?: (url: string) => void;
  desktopWindowApi?: GifMediaWindowApi;
};

export type GifMediaCloseOptions = {
  isDesktop?: boolean;
  navigate?: (url: string) => void;
  desktopWindow?: Pick<GifMediaWindow, 'close'>;
};

export async function openGifMediaDesktopWindow(api: GifMediaWindowApi): Promise<'desktop-existing' | 'desktop-created'> {
  const existing = await api.getByLabel(GIF_MEDIA_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return 'desktop-existing';
  }

  api.create(GIF_MEDIA_WINDOW_LABEL, {
    title: 'GIF / 媒体工具',
    url: GIF_MEDIA_PAGE_PATH,
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    resizable: true
  });
  return 'desktop-created';
}

async function loadDesktopWindowApi(): Promise<GifMediaWindowApi> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  return {
    getByLabel: (label) => WebviewWindow.getByLabel(label) as Promise<GifMediaWindow | null>,
    create: (label, options) => new WebviewWindow(label, options) as GifMediaWindow
  };
}

async function loadCurrentDesktopWindow(): Promise<Pick<GifMediaWindow, 'close'>> {
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  return getCurrentWebviewWindow() as Pick<GifMediaWindow, 'close'>;
}

export async function openGifMediaPreview(options: GifMediaLaunchOptions = {}): Promise<'browser' | 'desktop-existing' | 'desktop-created'> {
  const desktop = options.isDesktop ?? isDesktopBridgeAvailable();
  if (desktop) {
    return openGifMediaDesktopWindow(options.desktopWindowApi ?? await loadDesktopWindowApi());
  }

  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));
  navigate(GIF_MEDIA_PAGE_PATH);
  return 'browser';
}

export function returnToToolbox(navigate: (url: string) => void = (url) => window.location.assign(url)): void {
  navigate('/');
}

export async function closeGifMediaPreview(options: GifMediaCloseOptions = {}): Promise<'browser-returned' | 'desktop-closed'> {
  const desktop = options.isDesktop ?? isDesktopBridgeAvailable();
  if (desktop) {
    await (options.desktopWindow ?? await loadCurrentDesktopWindow()).close();
    return 'desktop-closed';
  }

  returnToToolbox(options.navigate);
  return 'browser-returned';
}
