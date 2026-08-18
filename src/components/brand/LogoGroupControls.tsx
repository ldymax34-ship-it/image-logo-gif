import type { BrandColorMode, BrandLanguage, BrandPlacement, BrandSize, CompanyLogoScale, LogoConstraintMode, LogoGroupMode, LogoGroupState } from '../../core';
import { Select } from '../ui';

const GROUP_MODE_OPTIONS: Array<{ value: LogoGroupMode; label: string }> = [
  { value: 'game-only', label: '仅游戏 Logo' },
  { value: 'company-only', label: '仅公司 Logo' },
  { value: 'company-and-game', label: '公司 + 游戏' }
];

const COLOR_MODE_OPTIONS: Array<{ value: BrandColorMode; label: string }> = [
  { value: 'original', label: '原色' },
  { value: 'white', label: '白色' },
  { value: 'black', label: '黑色' },
  { value: 'custom', label: '自定义' }
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

const CONSTRAINT_OPTIONS: Array<{ value: LogoConstraintMode; label: string }> = [
  { value: 'safe-area', label: '安全区内' },
  { value: 'canvas', label: '画布内' }
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
  onChange,
  effectColor,
  onEffectColorChange
}: {
  group: LogoGroupState;
  language: BrandLanguage;
  onLanguageChange: (language: BrandLanguage) => void;
  onChange: (next: LogoGroupState) => void;
  effectColor?: string;
  onEffectColorChange?: (color: string) => void;
}) {
  function patch(next: Partial<LogoGroupState>) {
    onChange({ ...group, ...next });
  }

  return (
    <div className="brand-section logo-group-section">
      <div className="toolbar-line compact">
        <label className="control-label small">组合</label>
        <Select
          value={group.mode}
          options={GROUP_MODE_OPTIONS}
          onChange={(value) => patch({ mode: value as LogoGroupMode })}
          aria-label="Logo 组合"
        />
      </div>
      <label className="range-field compact-range">
        <span>连续缩放 {Math.round((group.scale ?? 1) * 100)}% · 双击复位</span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.01"
          value={group.scale ?? 1}
          onChange={(event) => patch({ scale: Number(event.target.value) })}
          onDoubleClick={() => patch({ scale: 1 })}
          aria-label="Logo 连续缩放，双击恢复 100%"
          title="Logo 连续缩放，双击恢复 100%"
        />
      </label>
      <div className="toolbar-line compact">
        <label className="control-label small">语种</label>
        <Select value={language} options={[{ value: 'zh-CN', label: '简中' }, { value: 'zh-TW', label: '繁中' }, { value: 'ja-JP', label: '日文' }, { value: 'ko-KR', label: '韩文' }, { value: 'en-US', label: '英文' }]} onChange={(value) => onLanguageChange(value as BrandLanguage)} aria-label="Logo 语种" />
      </div>
      <div className="toolbar-line compact">
        <label className="control-label small">配色</label>
        <Select
          value={group.colorMode}
          options={COLOR_MODE_OPTIONS}
          onChange={(value) => patch({ colorMode: value as BrandColorMode })}
          aria-label="Logo 配色"
        />
      </div>
      {group.colorMode === 'custom' && onEffectColorChange ? <label className="control-row"><span>颜色</span><input className="color-input" type="color" value={effectColor ?? '#ffffff'} onChange={(event) => onEffectColorChange(event.target.value)} aria-label="Logo 自定义颜色" /></label> : null}
      <div className="toolbar-line compact">
        <label className="control-label small">位置</label>
        <Select
          value={group.placement === 'custom' ? group.lastExplicitPlacement ?? 'corner-right' : group.placement}
          options={PLACEMENT_OPTIONS}
          onChange={(value) => {
            const placement = value as Exclude<BrandPlacement, 'custom'>;
            patch({ placement, lastExplicitPlacement: placement, manualOffset: undefined });
          }}
          aria-label="Logo 位置"
        />
      </div>
      <div className="toolbar-line compact">
        <label className="control-label small">大小</label>
        <Select
          value={group.sizePreset}
          options={SIZE_OPTIONS}
          onChange={(value) => patch({ sizePreset: value as BrandSize })}
          aria-label="Logo 大小"
        />
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
        <Select value={group.companyLogoScale} options={COMPANY_SCALE_OPTIONS} onChange={(value) => patch({ companyLogoScale: value as CompanyLogoScale })} aria-label="公司 Logo 比例" />
      </div> : null}
            {group.placement === 'custom' ? <div className="toolbar-line compact">
        <label className="control-label small">位置边界</label>
        <Select value={group.constraintMode ?? 'safe-area'} options={CONSTRAINT_OPTIONS} onChange={(value) => patch({ constraintMode: value as LogoConstraintMode })} aria-label="Logo 位置边界" />
      </div> : null}
<p className="inline-note" title="Logo 位置与大小仅保存到当前画板；CPR 使用独立的底部设置。">当前画板独立保存；CPR 单独设置。</p>
    </div>
  );
}
