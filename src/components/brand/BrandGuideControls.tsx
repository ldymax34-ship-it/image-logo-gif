import type { BrandSettingsV1 } from '../../core';

export function BrandGuideControls({
  settings,
  onChange
}: {
  settings: BrandSettingsV1;
  onChange: (next: BrandSettingsV1) => void;
}) {
  function patch(next: Partial<BrandSettingsV1>) {
    onChange({ ...settings, ...next });
  }

  return (
    <div className="brand-section guide-section">
      <div className="panel-heading">
        <h2>辅助层</h2>
        <small>仅预览，不写入导出</small>
      </div>
      <div className="guide-grid">
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.gridVisible}
            onChange={(event) => patch({ gridVisible: event.target.checked })}
          />
          品牌网格
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.guidesVisible}
            onChange={(event) => patch({ guidesVisible: event.target.checked })}
          />
          中心线
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.safeAreaVisible}
            onChange={(event) => patch({ safeAreaVisible: event.target.checked })}
          />
          安全区
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.cprEnabled}
            onChange={(event) => patch({ cprEnabled: event.target.checked })}
          />
          CPR 参考
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.snapEnabled}
            onChange={(event) => patch({ snapEnabled: event.target.checked })}
          />
          网格吸附
        </label>
        <label className={`range-field ${settings.snapEnabled ? '' : 'is-disabled'}`}>
          <span className="control-label small">吸附 {settings.snapThreshold}px</span>
          <input
            type="range"
            min="2"
            max="24"
            step="1"
            value={settings.snapThreshold}
            disabled={!settings.snapEnabled}
            onChange={(event) => patch({ snapThreshold: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
