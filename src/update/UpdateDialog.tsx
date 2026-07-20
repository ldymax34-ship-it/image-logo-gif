import { useState } from 'react';
import packageMetadata from '../../package.json';
import { useUpdate } from './UpdateProvider';

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function copyDiagnostic(text: string) {
  void navigator.clipboard?.writeText(text);
}

export function UpdateDialog() {
  const { state, checkForUpdate, download, requestInstall, install, hideDialog, retry } = useUpdate();
  const [confirming, setConfirming] = useState(false);
  if (!state.dialogOpen) return null;
  const update = state.update;
  const diagnostic = state.diagnostic;
  const diagnosticText = diagnostic ? [
    `错误编号: ${diagnostic.code}`, `时间: ${diagnostic.timestamp}`, `版本: ${diagnostic.appVersion}`,
    `平台: ${diagnostic.platform}`, `阶段: ${diagnostic.stage}`, `原因: ${diagnostic.sanitizedDetails}`,
    `触发: ${diagnostic.trigger}`, `重试次数: ${diagnostic.retryCount}`
  ].join('\n') : '';
  const requestConfirmation = () => { if (requestInstall()) setConfirming(true); };
  const downloading = state.status === 'downloading';
  return <div className="dialog-backdrop confirm-backdrop" role="presentation"><section className="settings-dialog update-dialog" role="dialog" aria-modal="true" aria-label="软件更新">
    <div className="dialog-header"><div><span className="dialog-kicker">Preview 更新</span><h2>{state.status === 'checking' ? '正在检查更新' : state.status === 'up-to-date' ? '已是最新版' : update ? `${update.version} 可用` : '更新检查'}</h2><small>{update?.date ?? ' '}</small></div><button type="button" className="icon-button" onClick={hideDialog} aria-label={downloading ? '转到后台下载' : '关闭更新窗口'} title={downloading ? '转到后台下载（不会停止下载）' : '关闭'}>×</button></div>
    <div className="settings-dialog-body">
      {state.status === 'checking'
        ? <p>正在检查更新，请稍候。</p>
        : state.status === 'up-to-date'
          ? <p>当前版本 {packageMetadata.version} 已是最新 Preview。</p>
          : <p>{update?.notes || '已准备好新的 Preview 版本。'}</p>}
      {downloading ? <><div className="update-progress" aria-live="polite"><span>正在下载</span><span className="update-progress-values">{state.progress?.total ? `${Math.min(100, Math.round((state.progress.received / state.progress.total) * 100))}%  ${formatBytes(state.progress.received)} / ${formatBytes(state.progress.total)}` : '正在准备下载…'}</span></div><small className="inline-note">关闭此窗口不会停止下载；可在“检查更新”中重新打开进度。</small></> : null}
      {state.error ? <div className="update-error"><p className="size-warning">{state.error}</p>{diagnostic ? <small>错误编号：{diagnostic.code} · {diagnostic.retryable ? '可重试' : '请稍后检查更新说明或联系产品负责人'}</small> : null}</div> : null}
    </div>
    <div className="dialog-footer dialog-actions">
      {state.status === 'checking' ? <button type="button" disabled>正在检查…</button> : null}
      {state.status === 'up-to-date' ? <button type="button" className="primary-button" onClick={hideDialog}>知道了</button> : null}
      {state.status === 'available' ? <><button type="button" onClick={hideDialog}>稍后</button><button type="button" className="primary-button" onClick={() => void download()}>下载更新</button></> : null}
      {downloading ? <button type="button" onClick={hideDialog}>转到后台下载</button> : null}
      {state.status === 'downloaded' ? <><button type="button" onClick={hideDialog}>稍后安装</button><button type="button" className="primary-button" onClick={requestConfirmation}>安装并重启</button></> : null}
      {state.status === 'install-blocked' ? <><button type="button" onClick={hideDialog}>稍后</button><button type="button" className="primary-button" onClick={requestConfirmation}>重新检查后安装</button></> : null}
      {state.status === 'installing' ? <button type="button" disabled>正在安装…</button> : null}
      {state.status === 'error' ? <><button type="button" onClick={hideDialog}>稍后</button>{diagnosticText ? <button type="button" onClick={() => copyDiagnostic(diagnosticText)}>复制诊断信息</button> : null}{diagnostic?.retryable ? <button type="button" className="primary-button" onClick={() => void retry()}>重试</button> : null}</> : null}
    </div>
    {confirming ? <div className="focus-discard-confirm" role="alert"><span>安装更新后应用会关闭并重新启动。当前临时工作状态可能丢失，请确认已完成保存或导出。</span><button type="button" onClick={() => setConfirming(false)} disabled={state.status === 'installing'}>取消</button><button type="button" className="primary-button" onClick={() => { setConfirming(false); void install(); }} disabled={state.status === 'installing'}>确认安装并重启</button></div> : null}
  </section></div>;
}
