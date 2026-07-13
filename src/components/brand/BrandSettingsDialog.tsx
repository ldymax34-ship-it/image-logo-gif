import { useEffect, useRef, useState } from 'react';
import {
  BRAND_LANGUAGE_OPTIONS,
  DEFAULT_BRAND_SETTINGS,
  type AspectFamily,
  type BrandLanguage,
  type BrandPlacement,
  type BrandSettingsV1,
  type BrandColorMode,
  type BrandSize
} from '../../core';

const COLOR_OPTIONS: Array<{ value: Exclude<BrandColorMode, 'original'>; label: string }> = [
  { value: 'white', label: '白色' },
  { value: 'black', label: '黑色' }
];

const SIZE_OPTIONS: Array<{ value: BrandSize; label: string }> = [
  { value: 'small', label: '小' },
  { value: 'standard', label: '标准' },
  { value: 'large', label: '大' }
];

const ASPECTS: AspectFamily[] = ['landscape', 'square', 'portrait'];

const PLACEMENT_OPTIONS: Array<{ value: Exclude<BrandPlacement, 'custom'>; label: string }> = [
  { value: 'corner-left', label: '左上' },
  { value: 'center', label: '居中' },
  { value: 'corner-right', label: '右上' }
];

const GROUP_MODE_OPTIONS: Array<{ value: BrandSettingsV1['defaultLogoGroupMode']; label: string }> = [
  { value: 'game-only', label: '仅游戏 Logo' },
  { value: 'company-only', label: '仅公司 Logo' },
  { value: 'company-and-game', label: '公司 + 游戏' }
];

export function BrandSettingsDialog({
  settings,
  onClose,
  onChange,
  onReset
}: {
  settings: BrandSettingsV1;
  onClose: () => void;
  onChange: (next: BrandSettingsV1) => void;
  onReset: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<BrandSettingsV1>(settings);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  function patch(next: Partial<BrandSettingsV1>) {
    setDraft((previous) => ({ ...previous, ...next }));
  }

  function patchPlacement(aspect: AspectFamily, value: Exclude<BrandPlacement, 'custom'>) {
    setDraft((previous) => ({
      ...previous,
      defaultPlacementByAspect: { ...previous.defaultPlacementByAspect, [aspect]: value }
    }));
  }

  function commit() {
    onChange(draft);
    onClose();
  }

  function resetToDefaults() {
    onReset();
    setDraft(DEFAULT_BRAND_SETTINGS);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div
      className="dialog-backdrop confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brand-settings-title"
      >
        <div className="dialog-header">
          <div>
            <span className="dialog-kicker">品牌设置</span>
            <h2 id="brand-settings-title">默认配置</h2>
            <small>设置保存在浏览器 localStorage，不写入导出文件</small>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭设置" title="关闭">×</button>
        </div>

        <div className="settings-dialog-body">
          <div className="settings-group">
            <h3>默认 Logo 组合</h3>
            <label className="settings-field">
              <span>组合模式</span>
              <select
                value={draft.defaultLogoGroupMode}
                onChange={(event) => patch({ defaultLogoGroupMode: event.target.value as BrandSettingsV1['defaultLogoGroupMode'] })}
              >
                {GROUP_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>默认语种</span>
              <select
                value={draft.defaultLanguage}
                onChange={(event) => patch({ defaultLanguage: event.target.value as BrandLanguage })}
              >
                {BRAND_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>默认配色</span>
              <select
                value={draft.defaultColorMode}
                onChange={(event) => patch({ defaultColorMode: event.target.value as Exclude<BrandColorMode, 'original'> })}
              >
                {COLOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span>默认大小</span>
              <select
                value={draft.defaultSize}
                onChange={(event) => patch({ defaultSize: event.target.value as BrandSize })}
              >
                {SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="settings-group">
            <h3>各版型默认位置</h3>
            {ASPECTS.map((aspect) => (
              <label key={aspect} className="settings-field">
                <span>{aspect === 'landscape' ? '横版' : aspect === 'portrait' ? '竖版' : '方图'}</span>
                <select
                  value={draft.defaultPlacementByAspect[aspect]}
                  onChange={(event) => patchPlacement(aspect, event.target.value as Exclude<BrandPlacement, 'custom'>)}
                >
                  {PLACEMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="settings-group">
            <h3>预览辅助层</h3>
            <div className="guide-grid">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={draft.gridVisible}
                  onChange={(event) => patch({ gridVisible: event.target.checked })}
                />
                32 列网格
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={draft.guidesVisible}
                  onChange={(event) => patch({ guidesVisible: event.target.checked })}
                />
                中心线
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={draft.safeAreaVisible}
                  onChange={(event) => patch({ safeAreaVisible: event.target.checked })}
                />
                安全区
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={draft.snapEnabled}
                  onChange={(event) => patch({ snapEnabled: event.target.checked })}
                />
                网格吸附
              </label>
              <label className={`range-field ${draft.snapEnabled ? '' : 'is-disabled'}`}>
                <span className="control-label small">吸附 {draft.snapThreshold}px</span>
                <input
                  type="range"
                  min="2"
                  max="24"
                  step="1"
                  value={draft.snapThreshold}
                  disabled={!draft.snapEnabled}
                  onChange={(event) => patch({ snapThreshold: Number(event.target.value) })}
                />
              </label>
            </div>
          </div>

          <div className="settings-group cpr-info">
            <h3>固定 CPR 默认</h3>
            <p className="dialog-help">使用内置正式 SVG 资产，尺寸和底部位置由品牌网格固定计算。</p>
            <small className="cpr-sample">不提供文案、字体、字号、字重或独立坐标编辑。</small>
          </div>
        </div>

        <div className="dialog-footer">
          <span>{dirty ? '有未保存改动' : '与本地一致'}</span>
          <div className="dialog-actions">
            <button type="button" className="danger-button" onClick={resetToDefaults}>
              恢复默认
            </button>
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="button" className="primary-button" onClick={commit} disabled={!dirty && JSON.stringify(draft) === JSON.stringify(DEFAULT_BRAND_SETTINGS)}>
              保存
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
