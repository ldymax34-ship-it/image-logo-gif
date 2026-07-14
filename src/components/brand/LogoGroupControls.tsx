import type { BrandColorMode, BrandLanguage, BrandPlacement, BrandSize, CompanyLogoScale, LogoGroupMode, LogoGroupState } from '../../core';

const GROUP_MODE_OPTIONS: Array<{ value: LogoGroupMode; label: string }> = [
  { value: 'game-only', label: '仅游戏 Logo' },
  { value: 'company-only', label: '仅公司 Logo' },
  { value: 'company-and-game', label: '公司 + 游戏' }
];

const COLOR_MODE_OPTIONS: Array<{ value: BrandColorMode; label: string }> = [
  { value: 'white', label: '白色' },
  { value: 'black', label: '黑色' },
  { value: 'original', label: '原色' }
];

const SIZE_OPTIONS: Array<{ value: BrandSize; label: string }> = [
  { value: 'small', label: '小' },
  { value: 'standard', label: '标准' },
  { value: 'large', label: '大' },
  { value: 'xl', label: '特大（视频 / KV）' }
];

const COMPANY_SCALE_OPTIONS: Array<{ value: CompanyLogoScale; label: string }> = [
  { value: 'small', label: '较小' },
  { value: 'match', label: '匹配' },
  { value: 'large', label: '较大' }
];

const PLACEMENT_OPTIONS: Array<{ value: Exclude<BrandPlacement, 'custom'>; label: string }> = [
  { value: 'corner-left', label: '左上' },
  { value: 'center', label: '居中' },
  { value: 'corner-right', label: '右上' }
];

export function LogoGroupControls({
  group,
  language,
  onLanguageChange,
  onChange
}: {
  group: LogoGroupState;
  language: BrandLanguage;
  onLanguageChange: (language: BrandLanguage) => void;
  onChange: (next: LogoGroupState) => void;
}) {
  function patch(next: Partial<LogoGroupState>) {
    onChange({ ...group, ...next });
  }

  return (
    <div className="brand-section logo-group-section">
      <div className="panel-heading">
        <h2>Logo 组合</h2>
        <small>版型族规则自动识别</small>
      </div>
      <div className="toolbar-line compact">
        <label className="control-label small">组合</label>
        <select
          value={group.mode}
          onChange={(event) => patch({ mode: event.target.value as LogoGroupMode })}
        >
          {GROUP_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-line compact">
        <label className="control-label small">语种</label>
        <select value={language} onChange={(event) => onLanguageChange(event.target.value as BrandLanguage)}>
          <option value="zh-CN">简中</option><option value="zh-TW">繁中</option><option value="ja-JP">日文</option><option value="ko-KR">韩文</option><option value="en-US">英文</option>
        </select>
      </div>
      <div className="toolbar-line compact">
        <label className="control-label small">配色</label>
        <select
          value={group.colorMode}
          onChange={(event) => patch({ colorMode: event.target.value as BrandColorMode })}
        >
          {COLOR_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-line compact">
        <label className="control-label small">位置</label>
        <select
          value={group.placement === 'custom' ? group.lastExplicitPlacement ?? 'corner-right' : group.placement}
          onChange={(event) => {
            const placement = event.target.value as Exclude<BrandPlacement, 'custom'>;
            patch({ placement, lastExplicitPlacement: placement, manualOffset: undefined });
          }}
        >
          {PLACEMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-line compact">
        <label className="control-label small">大小</label>
        <select
          value={group.sizePreset}
          onChange={(event) => patch({ sizePreset: event.target.value as BrandSize })}
        >
          {SIZE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <label className="range-field">
        <span className="control-label small">间距 {group.gapUnits.toFixed(1)}U</span>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={group.gapUnits}
          onChange={(event) => patch({ gapUnits: Number(event.target.value) })}
        />
      </label>
      {group.mode === 'company-and-game' ? <div className="toolbar-line compact">
        <label className="control-label small">公司比例</label>
        <select value={group.companyLogoScale} onChange={(event) => patch({ companyLogoScale: event.target.value as CompanyLogoScale })}>
          {COMPANY_SCALE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div> : null}
      <p className="inline-note">位置与大小按当前画板保存；CPR 在底部独立设置。</p>
    </div>
  );
}
