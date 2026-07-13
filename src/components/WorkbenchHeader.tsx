export function WorkbenchHeader({ assetCount, boardCount, previewCount, hasPendingSpecChanges }: {
  assetCount: number;
  boardCount: number;
  previewCount: number;
  hasPendingSpecChanges: boolean;
}) {
  return <header className="topbar">
    <div>
      <p className="eyebrow">Brand Material Workbench · 0.1.11</p>
      <h1>品宣物料工作台</h1>
    </div>
    <div className="topbar-status" aria-label="当前工作台状态">
      <span>{assetCount} 张素材</span>
      <span>{boardCount} 个画板</span>
      <span>{previewCount} 个预览状态</span>
      {hasPendingSpecChanges ? <span>尺寸待应用</span> : null}
    </div>
  </header>;
}
