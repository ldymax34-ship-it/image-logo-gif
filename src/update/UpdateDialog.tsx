import { useState } from 'react';
import { useUpdate } from './UpdateProvider';

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateDialog() {
  const { state, checkForUpdate, download, requestInstall, install, dismiss } = useUpdate();
  const [confirming, setConfirming] = useState(false);
  const requestConfirmation = () => {
    if (requestInstall()) setConfirming(true);
  };
  if (state.status === 'idle' || state.status === 'checking') return null;
  const update = state.update;
  return <div className="dialog-backdrop confirm-backdrop" role="presentation"><section className="settings-dialog update-dialog" role="dialog" aria-modal="true" aria-label="软件更新">
    <div className="dialog-header"><div><span className="dialog-kicker">Preview 更新</span><h2>{update ? `${update.version} 可用` : '更新检查'}</h2><small>{update?.date ?? ' '}</small></div><button type="button" className="icon-button" onClick={dismiss} aria-label="稍后更新">×</button></div>
    <div className="settings-dialog-body"><p>{update?.notes || '已准备好新的 Preview 版本。'}</p>{state.status === 'downloading' ? <div className="update-progress" aria-live="polite"><span>正在下载</span><span className="update-progress-values">{state.progress?.total ? `${Math.min(100, Math.round((state.progress.received / state.progress.total) * 100))}%  ${formatBytes(state.progress.received)} / ${formatBytes(state.progress.total)}` : '正在准备下载…'}</span></div> : null}{state.error ? <p className="size-warning">{state.error}{state.failureStage ? `（${({ check: '检查', download: '下载', install: '安装' } as const)[state.failureStage]}阶段）` : ''}</p> : null}</div>
    <div className="dialog-footer dialog-actions">{state.status === 'available' || state.status === 'error' ? <><button type="button" onClick={dismiss}>稍后</button><button type="button" className="primary-button" onClick={() => void (state.status === 'error' ? checkForUpdate(true) : download())}>{state.status === 'error' ? '重试' : '下载更新'}</button></> : null}{state.status === 'downloading' ? <button type="button" disabled>正在下载…</button> : null}{state.status === 'downloaded' ? <><button type="button" onClick={dismiss}>稍后安装</button><button type="button" className="primary-button" onClick={requestConfirmation}>安装并重启</button></> : null}{state.status === 'install-blocked' ? <><button type="button" onClick={dismiss}>稍后</button><button type="button" className="primary-button" onClick={requestConfirmation}>重新检查后安装</button></> : null}{state.status === 'installing' ? <button type="button" disabled>正在安装…</button> : null}</div>
    {confirming ? <div className="focus-discard-confirm" role="alert"><span>安装更新后应用会关闭并重新启动。当前临时工作状态可能丢失，请确认已完成保存或导出。</span><button type="button" onClick={() => setConfirming(false)} disabled={state.status === 'installing'}>取消</button><button type="button" className="primary-button" onClick={() => { setConfirming(false); void install(); }} disabled={state.status === 'installing'}>确认安装并重启</button></div> : null}
  </section></div>;
}
