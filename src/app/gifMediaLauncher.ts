import { isDesktopBridgeAvailable } from '../platform/desktopBridge';

export const GIF_TOOL_PAGE_PATH = '/gif-tool.html';
export const WATERMARK_TOOL_PAGE_PATH = '/watermark-tool.html';
export const GIF_TOOL_WINDOW_LABEL = 'gif-tool';
export const WATERMARK_TOOL_WINDOW_LABEL = 'watermark-tool';
export type GifMediaWindowMode = 'gif' | 'watermark';

export type GifMediaWindow = {
  show: () => Promise<void>;
  setFocus: () => Promise<void>;
  close: () => Promise<void>;
  emit: (event: string, payload: unknown) => Promise<void>;
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
  mode?: GifMediaWindowMode;
};

function toolPageUrl(mode: GifMediaWindowMode): string {
  return mode === 'watermark' ? WATERMARK_TOOL_PAGE_PATH : GIF_TOOL_PAGE_PATH;
}

function toolWindowLabel(mode: GifMediaWindowMode): string {
  return mode === 'watermark' ? WATERMARK_TOOL_WINDOW_LABEL : GIF_TOOL_WINDOW_LABEL;
}

function toolWindowTitle(mode: GifMediaWindowMode): string {
  return mode === 'watermark' ? '水印与追溯' : 'GIF 合成与压缩';
}

export async function openGifMediaDesktopWindow(api: GifMediaWindowApi, mode: GifMediaWindowMode = 'gif'): Promise<'desktop-existing' | 'desktop-created'> {
  const label = toolWindowLabel(mode);
  const existing = await api.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return 'desktop-existing';
  }

  api.create(label, {
    title: toolWindowTitle(mode),
    url: toolPageUrl(mode),
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
  const mode = options.mode ?? 'gif';
  const desktop = options.isDesktop ?? isDesktopBridgeAvailable();
  if (desktop) {
    return openGifMediaDesktopWindow(options.desktopWindowApi ?? await loadDesktopWindowApi(), mode);
  }

  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));
  navigate(toolPageUrl(mode));
  return 'browser';
}

export function returnToToolbox(navigate?: (url: string) => void): void {
  const nav = navigate ?? ((url: string) => window.location.assign(url));
  nav('/');
}

export async function closeGifMediaPreview(options: { isDesktop?: boolean; navigate?: (url: string) => void; desktopWindow?: Pick<GifMediaWindow, 'close'> } = {}): Promise<'browser-returned' | 'desktop-closed'> {
  const desktop = options.isDesktop ?? isDesktopBridgeAvailable();
  if (desktop) {
    await (options.desktopWindow ?? await loadCurrentDesktopWindow()).close();
    return 'desktop-closed';
  }

  returnToToolbox(options.navigate);
  return 'browser-returned';
}
