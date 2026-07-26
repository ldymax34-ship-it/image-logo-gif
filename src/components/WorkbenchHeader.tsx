export function WorkbenchHeader({ assetCount, boardCount, previewCount, hasPendingSpecChanges, onOpenSettings, onCheckUpdate }: {
  assetCount: number;
  boardCount: number;
  previewCount: number;
  hasPendingSpecChanges: boolean;
  onOpenSettings?: () => void;
  onCheckUpdate?: () => void;
}) {
  return <header className="topbar">
    <div className="tool-page-heading">
      <h1>Logo 与版式</h1>
      <span className="tool-status-badge is-stable">可用</span>
      <p className="tool-page-description">批量套用 Logo、CPR 与常用画板尺寸。</p>
    </div>
    <div className="topbar-status" aria-label="当前工作台状态">
      <span>{assetCount} 张素材</span>
      <span>{boardCount} 个画板</span>
      <span>{previewCount} 个预览状态</span>
      {hasPendingSpecChanges ? <span>尺寸待应用</span> : null}
      {onCheckUpdate ? <button type="button" className="settings-button" onClick={onCheckUpdate} title="检查更新">检查更新</button> : null}{onOpenSettings ? <button type="button" className="settings-button" onClick={onOpenSettings} title="打开 Logo 设置与关于信息">设置</button> : null}
    </div>
  </header>;
}
