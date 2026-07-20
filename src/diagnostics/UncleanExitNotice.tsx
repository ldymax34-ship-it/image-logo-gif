import { useEffect, useState } from 'react';
import { copyLatestError, exportDiagnostics, getDiagnosticsInfo, type DiagnosticsInfo } from './client';

export function UncleanExitNotice() {
  const [info, setInfo] = useState<DiagnosticsInfo>();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { void getDiagnosticsInfo().then(setInfo); }, []);
  if (!info?.previous_session_unclean || dismissed) return null;
  return (
    <div className="diagnostics-notice" role="status">
      <span>上次运行可能异常退出。</span>
      <button type="button" onClick={() => void copyLatestError(info)}>复制摘要</button>
      <button type="button" onClick={() => void exportDiagnostics()}>导出诊断包</button>
      <button type="button" onClick={() => setDismissed(true)}>稍后</button>
    </div>
  );
}
