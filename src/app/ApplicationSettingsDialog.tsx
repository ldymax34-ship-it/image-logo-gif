import { useEffect } from 'react';

export function ApplicationSettingsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="application-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="application-settings-title">
        <div className="dialog-header">
          <div>
            <span className="eyebrow">应用级偏好</span>
            <h2 id="application-settings-title">设置</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭应用设置" title="关闭">×</button>
        </div>
        <div className="application-settings-dialog-body">
          <p>启动偏好会保存在本机，不影响 Logo 资源、画板或未保存的工作内容。</p>
          <p className="inline-note">当前版本仅提供工具箱与 Logo 与版式工作区。</p>
        </div>
        <div className="dialog-footer">
          <span />
          <div className="dialog-actions"><button type="button" className="primary-button" onClick={onClose}>完成</button></div>
        </div>
      </section>
    </div>
  );
}
