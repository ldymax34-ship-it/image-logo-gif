import { GlobalTopActions } from '../app/GlobalTopActions';
import { Palette } from 'lucide-react';

export function WorkbenchHeader({ assetCount, boardCount, previewCount, hasPendingSpecChanges, onOpenSettings, onCheckUpdate, onOpenChangelog }: {
  assetCount: number;
  boardCount: number;
  previewCount: number;
  hasPendingSpecChanges: boolean;
  onOpenSettings?: () => void;
  onCheckUpdate?: () => void;
  onOpenChangelog?: () => void;
}) {
  return <header className="topbar">
    <div className="tool-page-heading">
      <span className="tool-page-icon" aria-hidden="true"><Palette size={18} strokeWidth={1.6} /></span>
      <h1>Logo 与版式</h1>
      <span className="tool-status-badge is-stable">可用</span>
      <p className="tool-page-description">批量套用 Logo、CPR 与常用画板尺寸。</p>
    </div>
    <div className="topbar-status" aria-label="当前工作台状态">
      <span className="workbench-summary" aria-label={`${assetCount} 张素材，${boardCount} 个画板，${previewCount} 个预览状态`}>
        {assetCount} 素材 · {boardCount} 画板 · {previewCount} 预览
      </span>
      {hasPendingSpecChanges ? <span className="workbench-pending">尺寸待应用</span> : null}
      {onCheckUpdate ? <button type="button" className="settings-button" onClick={onCheckUpdate} title="检查更新">检查更新</button> : null}{onOpenSettings ? <button type="button" className="settings-button" onClick={onOpenSettings} title="打开 Logo 设置与关于信息">设置</button> : null}
      <GlobalTopActions onOpenChangelog={onOpenChangelog} />
    </div>
  </header>;
}
