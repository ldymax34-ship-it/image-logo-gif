import { Button } from './Button';

export function ConfirmDialog({ title, message, confirmLabel, destructive, onCancel, onConfirm }: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <div className="dialog-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <div className="dialog-header"><h2 id="confirm-dialog-title">{title}</h2><Button className="icon-button" onClick={onCancel} aria-label="关闭确认弹窗" title="关闭">×</Button></div>
      <p id="confirm-dialog-message">{message}</p>
      <div className="dialog-footer"><span /><div className="dialog-actions"><Button onClick={onCancel} autoFocus>取消</Button><Button tone={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button></div></div>
    </section>
  </div>;
}
