import { LOGO_SCALE_MAX, LOGO_SCALE_MIN, type BrandColorMode, type BrandLanguage, type BrandPlacement, type BrandSize, type CompanyLogoScale, type LogoConstraintMode, type LogoGroupMode, type LogoGroupState } from '../../core';
import { useEffect, useState, type CSSProperties } from 'react';
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

export const LOGO_SIZE_OPTIONS: Array<{ value: BrandSize; label: string }> = [
  { value: 'small', label: '小' },
  { value: 'standard', label: '标准' },
  { value: 'large', label: '大' },
  { value: 'xl', label: '特大（视频 / KV）' },
  { value: 'xxl', label: '超大（KV）' }
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

export function clampLogoScale(value: number, maxScale = LOGO_SCALE_MAX): number {
  const upper = Math.max(LOGO_SCALE_MIN, Math.min(LOGO_SCALE_MAX, maxScale));
  return Number.isFinite(value) ? Math.min(upper, Math.max(LOGO_SCALE_MIN, value)) : 1;
}

export function getLogoScaleProgress(scale: number, maxScale = LOGO_SCALE_MAX): number {
  const value = clampLogoScale(scale, maxScale);
  const range = maxScale - LOGO_SCALE_MIN;
  return range > 0 ? ((value - LOGO_SCALE_MIN) / range) * 100 : 0;
}

export function parseLogoScalePercent(value: string, currentScale: number, maxScale = LOGO_SCALE_MAX): number {
  if (!value.trim()) return currentScale;
  const percent = Number(value);
  return Number.isFinite(percent) ? clampLogoScale(percent / 100, maxScale) : currentScale;
}

function formatLogoScalePercent(scale: number): string {
  return String(Math.round(scale * 100));
}

function LogoScalePercentInput({
  scale,
  maxScale,
  onCommit
}: {
  scale: number;
  maxScale: number;
  onCommit: (nextScale: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatLogoScalePercent(scale));

  useEffect(() => {
    setDraft(formatLogoScalePercent(scale));
  }, [scale]);

  function commit() {
    const nextScale = parseLogoScalePercent(draft, scale, maxScale);
    setDraft(formatLogoScalePercent(nextScale));
    onCommit(nextScale);
  }

  return (
    <input
      type="number"
      min={LOGO_SCALE_MIN * 100}
      max={maxScale * 100}
      step="1"
      inputMode="numeric"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      aria-label="Logo 连续缩放百分比"
      title={`Logo 连续缩放百分比（${Math.round(LOGO_SCALE_MIN * 100)}–${Math.round(maxScale * 100)}%）`}
    />
  );
}

export function LogoGroupControls({
  group,
  language,
  onLanguageChange,
  onChange,
  effectColor,
  onEffectColorChange,
  scaleMax
}: {
  group: LogoGroupState;
  language: BrandLanguage;
  onLanguageChange: (language: BrandLanguage) => void;
  onChange: (next: LogoGroupState) => void;
  effectColor?: string;
  onEffectColorChange?: (color: string) => void;
  scaleMax?: number;
}) {
  const resolvedScaleMax = Math.max(LOGO_SCALE_MIN, Math.min(LOGO_SCALE_MAX, scaleMax ?? LOGO_SCALE_MAX));
  const scale = clampLogoScale(group.scale ?? 1, resolvedScaleMax);

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
      <div className="range-field compact-range logo-scale-field">
        <span>连续缩放 {Math.round(scale * 100)}% · 双击复位</span>
        <div className="logo-scale-controls">
          <input
            type="range"
            min={LOGO_SCALE_MIN}
            max={resolvedScaleMax}
            step="0.01"
            value={scale}
            style={{ '--range-progress': `${getLogoScaleProgress(scale, resolvedScaleMax)}%` } as CSSProperties}
            onChange={(event) => patch({ scale: clampLogoScale(Number(event.target.value), resolvedScaleMax) })}
            onDoubleClick={() => patch({ scale: clampLogoScale(1, resolvedScaleMax) })}
            aria-label="Logo 连续缩放，双击恢复 100%"
            title="Logo 连续缩放，双击恢复 100%"
          />
          <LogoScalePercentInput
            scale={scale}
            maxScale={resolvedScaleMax}
            onCommit={(nextScale) => patch({ scale: nextScale })}
          />
        </div>
      </div>
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
          options={LOGO_SIZE_OPTIONS}
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
