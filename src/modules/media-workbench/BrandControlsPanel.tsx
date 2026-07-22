import type { BrandAsset, BrandLanguage, BrandLayerState, BrandSettingsV1, CprState, LogoGroupState } from '../../core';
import { BrandEffectControls, BrandGuideControls, BrandPanel, CprControls, LogoGroupControls, LogoStylePreview, SectionHeader } from '../../components';

export function BrandControlsPanel({ logoGroup, cprState, brandLayer, brandSettings, gameLogoAsset, activeSection, onLanguageChange, onLogoChange, onCprChange, onBrandLayerChange, onSettingsChange, onApplyLogoSameSize, onApplyLogoSameAsset, onApplyCprSameSize, onApplyCprSameAsset }: {
  logoGroup: LogoGroupState; cprState: CprState; brandLayer: BrandLayerState; brandSettings: BrandSettingsV1;
  gameLogoAsset?: BrandAsset; activeSection?: 'logo' | 'cpr'; onLanguageChange: (language: BrandLanguage) => void;
  onLogoChange: (logo: LogoGroupState) => void; onCprChange: (cpr: CprState) => void;
  onBrandLayerChange: (layer: BrandLayerState) => void; onSettingsChange: (settings: BrandSettingsV1) => void;
  onApplyLogoSameSize?: () => void; onApplyLogoSameAsset?: () => void; onApplyCprSameSize?: () => void; onApplyCprSameAsset?: () => void;
}) {
  return <BrandPanel>
    <section className="brand-control-group" aria-labelledby="logo-controls-title">
      <SectionHeader id="logo-controls-title" title="Logo" description="组合与单项资源" state={activeSection === 'logo' ? 'active' : brandLayer.logoEnabled ? 'idle' : 'disabled'} />
      <LogoGroupControls group={logoGroup} language={logoGroup.gameLogoLanguage} onLanguageChange={onLanguageChange} onChange={onLogoChange} />
      <label className="toggle compact-toggle"><input type="checkbox" checked={brandLayer.logoEnabled} onChange={(event) => onBrandLayerChange({ ...brandLayer, logoEnabled: event.target.checked })} />显示 Logo</label>
      <BrandEffectControls title="Logo" effect={brandLayer.logoEffect} onChange={(logoEffect) => onBrandLayerChange({ ...brandLayer, logoEffect })} preview={<LogoStylePreview asset={gameLogoAsset} effect={brandLayer.logoEffect} />} />
      {onApplyLogoSameSize || onApplyLogoSameAsset ? <div className="brand-apply-actions"><span>应用范围</span>{onApplyLogoSameSize ? <button type="button" onClick={onApplyLogoSameSize}>同尺寸</button> : null}{onApplyLogoSameAsset ? <button type="button" onClick={onApplyLogoSameAsset}>同素材</button> : null}</div> : null}
    </section>
    <CprControls state={cprState} onChange={onCprChange} onApplySameSpec={onApplyCprSameSize} onApplySameAsset={onApplyCprSameAsset} sectionState={activeSection === 'cpr' ? 'active' : undefined} />
    <section className="brand-control-group" aria-labelledby="guide-controls-title">
      <SectionHeader id="guide-controls-title" title="辅助工具" description="画布显示与吸附" state="idle" />
      <BrandGuideControls settings={brandSettings} onChange={onSettingsChange} />
    </section>
  </BrandPanel>;
}
