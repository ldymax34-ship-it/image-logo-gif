/**
 * Keep the desktop-runtime check in one place so UI and core modules never
 * need to import Tauri directly. The property is injected by Tauri's WebView
 * before the application bundle executes.
 */
export function isDesktopBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
