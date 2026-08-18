import { useEffect } from 'react';
import changelogRaw from '../../CHANGELOG.md?raw';

export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="changelog-dialog" role="dialog" aria-modal="true" aria-labelledby="changelog-dialog-title">
        <div className="dialog-header">
          <div>
            <span className="eyebrow">版本记录</span>
            <h2 id="changelog-dialog-title">更新日志</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭更新日志" title="关闭">×</button>
        </div>
        <div className="changelog-dialog-body">
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'inherit' }}>{changelogRaw}</pre>
        </div>
        <div className="dialog-footer">
          <span />
          <div className="dialog-actions"><button type="button" className="primary-button" onClick={onClose}>关闭</button></div>
        </div>
      </section>
    </div>
  );
}
