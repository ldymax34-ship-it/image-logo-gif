import { useEffect, useState } from 'react';
import {
  clearOldLogs,
  copyLatestError,
  exportDiagnostics,
  getDiagnosticsInfo,
  openLogDirectory,
  type DiagnosticsInfo
} from './client';

export function DiagnosticsSection() {
  const [info, setInfo] = useState<DiagnosticsInfo>();
  const [message, setMessage] = useState('');

  const refresh = () => void getDiagnosticsInfo().then(setInfo);
  useEffect(refresh, []);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      const result = await action();
      if (result !== undefined && result !== false) setMessage(success);
      refresh();
    } catch {
      setMessage('诊断操作未完成，主功能不受影响。');
    }
  };

  return (
    <div className="settings-group diagnostics-settings">
      <h3>诊断与日志</h3>
      <p>日志状态：{info ? (info.logging_available ? '本地写入正常' : '日志写入不可用') : '仅桌面版可用'}</p>
      <small className="inline-note">默认仅保存在本机，不会自动上传。复制和导出内容会隐藏凭据、完整路径和敏感 URL。</small>
      <div className="dialog-actions">
        <button type="button" disabled={!info} onClick={() => void run(openLogDirectory, '已打开日志目录')}>打开日志目录</button>
        <button type="button" disabled={!info} onClick={() => void run(() => copyLatestError(info), '已复制最近一次错误')}>复制最近一次错误</button>
        <button type="button" disabled={!info} onClick={() => void run(exportDiagnostics, '诊断包已导出')}>导出诊断包</button>
        <button type="button" disabled={!info} onClick={() => void run(clearOldLogs, '旧日志已清理')}>清理旧日志</button>
      </div>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
