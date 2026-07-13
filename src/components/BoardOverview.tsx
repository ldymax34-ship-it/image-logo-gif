import type { ReactNode } from 'react';
import { Button, Panel, Toolbar } from './ui';

export function BoardOverview({ disabled, onExport, children, message }: {
  disabled: boolean;
  onExport: () => void;
  children: ReactNode;
  message?: string;
}) {
  return <Panel className="preview-panel" aria-label="画板总览">
    <div className="panel-heading">
      <div><h2>画板总览</h2><small>单击选择画板，双击进入调整</small></div>
      <Toolbar className="panel-actions"><Button tone="primary" onClick={onExport} disabled={disabled}>批量导出</Button></Toolbar>
    </div>
    {children}
    {message ? <p className="status-line">{message}</p> : null}
  </Panel>;
}
