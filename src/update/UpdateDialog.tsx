import { useState } from 'react';
import { useUpdate } from './UpdateProvider';

export function UpdateDialog() {
  const { state, checkForUpdate, download, requestInstall, install, dismiss } = useUpdate();
  const [confirming, setConfirming] = useState(false);
  if (state.status === 'idle' || state.status === 'checking') return null;
  const update = state.update;
  return <div className="dialog-backdrop confirm-backdrop" role="presentation"><section className="settings-dialog update-dialog" role="dialog" aria-modal="true" aria-label="软件更新">
    <div className="dialog-header"><div><span className="dialog-kicker">Preview 更新</span><h2>{update ? `${update.version} 可用` : '更新检查'}</h2><small>{update?.date ?? ' '}</small></div><button type="button" className="icon-button" onClick={dismiss} aria-label="稍后更新">×</button></div>
    <div className="settings-dialog-body"><p>{update?.notes || '已准备好新的 Preview 版本。'}</p>{state.status === 'downloading' ? <p>正在下载 {state.progress?.total ? `${Math.round((state.progress.received / state.progress.total) * 100)}%` : '…'}</p> : null}{state.error ? <p className="size-warning">{state.error}</p> : null}</div>
    <div className="dialog-footer dialog-actions">{state.status === 'available' || state.status === 'error' ? <><button type="button" onClick={dismiss}>稍后</button><button type="button" className="primary-button" onClick={() => void (state.status === 'error' ? checkForUpdate(true) : download())}>{state.status === 'error' ? '重试' : '下载更新'}</button></> : null}{state.status === 'downloading' ? <button type="button" disabled>正在下载…</button> : null}{state.status === 'downloaded' ? <><button type="button" onClick={dismiss}>稍后安装</button><button type="button" className="primary-button" onClick={requestInstall}>安装并重启</button></> : null}{state.status === 'install-blocked' && !state.error ? <><button type="button" onClick={dismiss}>取消</button><button type="button" className="primary-button" onClick={() => setConfirming(true)}>安装并重启</button></> : null}{state.status === 'installing' ? <button type="button" disabled>正在安装…</button> : null}</div>
    {confirming ? <div className="focus-discard-confirm" role="alert"><span>安装更新后应用会关闭并重新启动。当前临时工作状态可能丢失，请确认已完成保存或导出。</span><button type="button" onClick={() => setConfirming(false)}>取消</button><button type="button" className="primary-button" onClick={() => void install()}>安装并重启</button></div> : null}
  </section></div>;
}
