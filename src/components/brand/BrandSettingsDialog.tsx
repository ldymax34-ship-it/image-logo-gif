import { useEffect, useRef, useState } from 'react';
import {
  BRAND_LANGUAGE_OPTIONS,
  DEFAULT_BRAND_SETTINGS,
  EXPORT_LANGUAGES,
  getBrandLanguageLabel,
  type AspectFamily,
  type BrandLanguage,
  type BrandPlacement,
  type BrandSettingsV1,
  type BrandColorMode,
  type BrandSize,
  type CprPlacement
} from '../../core';
import { BrandResourceManager } from './BrandResourceManager';
import { DiagnosticsSection } from '../../diagnostics';

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

type SettingsTab = 'general' | 'brand-lang' | 'cpr-guides' | 'updates' | 'diagnostics';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: '常规' },
  { id: 'brand-lang', label: 'Logo 与语种' },
  { id: 'cpr-guides', label: 'CPR与辅助' },
  { id: 'updates', label: '更新' },
  { id: 'diagnostics', label: '诊断' }
];

export function isBrandSettingsDirty(settings: BrandSettingsV1, draft: BrandSettingsV1): boolean { return JSON.stringify(draft) !== JSON.stringify(settings); }

export function BrandSettingsDialog({
  settings,
  assets,
  selectedLogoId,
  selectedCompanyLogoId,
  onSelectResource,
  onReplaceResource,
  onRestoreResources,
  onDirtyChange,
  onClose,
  onChange,
  version,
  onCheckUpdate
}: {
  settings: BrandSettingsV1;
  assets: import('../../core').BrandAsset[];
  selectedLogoId?: string;
  selectedCompanyLogoId?: string;
  onSelectResource: (asset: import('../../core').BrandAsset) => void;
  onReplaceResource: (asset: import('../../core').BrandAsset | undefined, language: BrandLanguage) => void;
  onRestoreResources: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onClose: () => void;
  onChange: (next: BrandSettingsV1) => void;
  version?: string;
  onCheckUpdate?: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState<BrandSettingsV1>(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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

  function patchLanguageScale(language: BrandLanguage, value: number) {
    const scale = Math.min(2, Math.max(0.5, Number.isFinite(value) ? value : 1));
    setDraft((previous) => ({
      ...previous,
      logoScaleByLanguage: { ...previous.logoScaleByLanguage, [language]: scale }
    }));
  }

  function commit() {
    onChange(draft);
    onClose();
  }

  function resetToDefaults() {
    setDraft(DEFAULT_BRAND_SETTINGS);
  }

  const dirty = isBrandSettingsDirty(settings, draft);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

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
            <span className="dialog-kicker">Logo 设置</span>
            <h2 id="brand-settings-title">默认配置</h2>
            <small>默认组合影响新画板；语种大小用于语种切换和多语言导出</small>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭设置" title="关闭">×</button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label="设置分类">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="settings-dialog-body" role="tabpanel">
          {activeTab === 'general' && (
            <>
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
            </>
          )}

          {activeTab === 'brand-lang' && (
            <>
              <div className="settings-group">
                <h3>各语种 Logo 视觉大小</h3>
                <small className="inline-note">以 1.00 为基准，用于修正不同语种 Logo 的视觉体量。</small>
                <div className="language-logo-scale-grid">
                  {EXPORT_LANGUAGES.map((language) => {
                    const value = draft.logoScaleByLanguage[language] ?? 1;
                    return <label key={language} className="language-logo-scale-field">
                      <span>{getBrandLanguageLabel(language)}</span>
                      <input type="range" min="0.5" max="2" step="0.01" value={value} onChange={(event) => patchLanguageScale(language, Number(event.target.value))} />
                      <input aria-label={`${getBrandLanguageLabel(language)} Logo 大小`} type="number" min="0.5" max="2" step="0.01" value={Number(value.toFixed(2))} onChange={(event) => patchLanguageScale(language, Number(event.target.value))} />
                    </label>;
                  })}
                </div>
              </div>
              <div className="settings-group">
                <BrandResourceManager assets={assets} selectedLogoId={selectedLogoId} selectedCompanyLogoId={selectedCompanyLogoId} onSelect={onSelectResource} onReplace={onReplaceResource} onRestore={onRestoreResources} />
              </div>
            </>
          )}

          {activeTab === 'cpr-guides' && (
            <>
              <div className="settings-group">
                <h3>预览辅助层</h3>
                <div className="guide-grid">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={draft.gridVisible}
                      onChange={(event) => patch({ gridVisible: event.target.checked })}
                    />
                    构图网格
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
                <label className="settings-field">
                  <span>聚焦滚轮缩放灵敏度</span>
                  <select value={draft.focusWheelSensitivity ?? 'standard'} onChange={(event) => patch({ focusWheelSensitivity: event.target.value as 'low' | 'standard' | 'high' })}>
                    <option value="low">低</option>
                    <option value="standard">标准</option>
                    <option value="high">高</option>
                  </select>
                </label>
<label className="settings-field">
                  <span>默认位置</span>
                  <select value={draft.defaultCprPlacement} onChange={(event) => patch({ defaultCprPlacement: event.target.value as CprPlacement })}>
                    <option value="bottom-left">左下</option>
                    <option value="bottom-center">底部居中</option>
                    <option value="bottom-right">右下</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>默认颜色</span>
                  <select value={draft.defaultCprColorMode} onChange={(event) => patch({ defaultCprColorMode: event.target.value as BrandColorMode })}>
                    <option value="white">白色</option>
                    <option value="black">黑色</option>
                    <option value="original">原始色</option>
                  </select>
                </label>
                <small className="cpr-sample">不提供文案、字体、字号、字重或独立坐标编辑。</small>
              </div>
            </>
          )}

          {activeTab === 'updates' && (
            <div className="settings-group">
              <h3>关于与更新</h3>
              <div className="update-row">
                <span className="version-label">当前版本 {version ?? '-'}</span>
                {onCheckUpdate ? <button type="button" onClick={onCheckUpdate}>检查更新</button> : null}
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsSection />
          )}
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
            <button type="button" className="primary-button" onClick={commit} disabled={!dirty}>
              保存
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
