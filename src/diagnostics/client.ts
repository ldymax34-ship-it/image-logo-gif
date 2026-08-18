import { invoke } from '@tauri-apps/api/core';
import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import { diagnosticSummary, sanitizeForDiagnostics } from './sanitize';

export type DiagnosticsInfo = {
  session_id: string;
  app_version: string;
  log_dir: string;
  logging_available: boolean;
  previous_session_unclean: boolean;
  recent_errors: string[];
};

export async function logDiagnostic(
  level: 'info' | 'warn' | 'error',
  code: string,
  error: unknown,
  context?: string
): Promise<void> {
  const message = diagnosticSummary(code, error, context);
  if (!isDesktopBridgeAvailable()) {
    if (level === 'error') console.error(message);
    return;
  }
  try {
    const logger = await import('@tauri-apps/plugin-log');
    await logger[level](message);
  } catch {
    // Diagnostics must never become an application failure.
  }
}

export async function getDiagnosticsInfo(): Promise<DiagnosticsInfo | undefined> {
  if (!isDesktopBridgeAvailable()) return undefined;
  try {
    return await invoke<DiagnosticsInfo>('diagnostics_info');
  } catch {
    return undefined;
  }
}

export async function openLogDirectory(): Promise<void> {
  if (!isDesktopBridgeAvailable()) return;
  await invoke('diagnostics_open_log_dir');
}

export async function clearOldLogs(): Promise<number> {
  if (!isDesktopBridgeAvailable()) return 0;
  return invoke<number>('diagnostics_clear_old');
}

export async function exportDiagnostics(): Promise<string | undefined> {
  if (!isDesktopBridgeAvailable()) return undefined;
  const { save } = await import('@tauri-apps/plugin-dialog');
  const destination = await save({
    title: '导出诊断包',
    defaultPath: `brand-workbench-diagnostics-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  });
  if (!destination) return undefined;
  return invoke<string>('diagnostics_export_zip', { destPath: destination });
}

export async function copyLatestError(info?: DiagnosticsInfo): Promise<boolean> {
  const resolved = info ?? await getDiagnosticsInfo();
  const latest = resolved?.recent_errors.at(-1) ?? '暂无错误记录';
  const summary = [
    `错误摘要：${sanitizeForDiagnostics(latest, 320)}`,
    `版本：${resolved?.app_version ?? 'unknown'}`,
    `平台：${navigator.platform || 'unknown'}`,
    `会话：${resolved?.session_id ?? 'unknown'}`
  ].join('\n');
  try {
    await navigator.clipboard.writeText(summary);
    return true;
  } catch {
    return false;
  }
}
