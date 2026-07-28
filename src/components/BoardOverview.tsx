import type { ReactNode } from 'react';
import { Button, Panel, Toolbar } from './ui';

export function BoardOverview({
  disabled,
  onExport,
  children,
  message,
  title = '画板总览',
  subtitle = '单击选择画板，双击进入调整',
  exportLabel = '批量导出',
  exportAriaLabel,
  ariaLabel = title,
}: {
  disabled: boolean;
  onExport: () => void;
  children: ReactNode;
  message?: string;
  title?: string;
  subtitle?: string;
  exportLabel?: string;
  exportAriaLabel?: string;
  ariaLabel?: string;
}) {
  return <Panel className="preview-panel" aria-label={ariaLabel}>
    <div className="panel-heading">
      <div><h2>{title}</h2><small>{subtitle}</small></div>
      <Toolbar className="panel-actions"><Button tone="primary" onClick={onExport} disabled={disabled} aria-label={exportAriaLabel}>{exportLabel}</Button></Toolbar>
    </div>
    {children}
    {message ? <p className="status-line">{message}</p> : null}
  </Panel>;
}
