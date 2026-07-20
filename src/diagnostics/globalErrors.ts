import { logDiagnostic } from './client';

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    void logDiagnostic('error', 'UI_UNHANDLED_ERROR', event.error ?? event.message, 'window.error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    void logDiagnostic('error', 'UI_UNHANDLED_REJECTION', event.reason, 'unhandledrejection');
  });
}
