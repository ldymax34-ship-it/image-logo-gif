import type { ReactNode } from 'react';
import { GlobalTopActions } from '../app/GlobalTopActions';

type ToolPageHeaderProps = {
  title: string;
  description: string;
  status: 'available' | 'experimental';
  icon?: ReactNode;
  onReturn: () => void;
  onOpenChangelog?: () => void;
  showReturn?: boolean;
};

export function ToolPageHeader({ title, description, status, icon, onReturn, onOpenChangelog, showReturn = true }: ToolPageHeaderProps) {
  return (
    <header className="embedded-tool-topbar">
      {showReturn ? <button type="button" className="capsule-back-button" onClick={onReturn}>返回工具箱</button> : null}
      <div className="tool-page-heading">
        {icon ? <span className="tool-page-icon" aria-hidden="true">{icon}</span> : null}
        <h1 className="embedded-tool-title">{title}</h1>
        <span className={`tool-status-badge ${status === 'available' ? 'is-stable' : ''}`}>
          {status === 'available' ? '可用' : '实验'}
        </span>
        <p className="tool-page-description">{description}</p>
      </div>
      <div className="tool-page-actions">
        <GlobalTopActions onOpenChangelog={onOpenChangelog} />
      </div>
    </header>
  );
}
