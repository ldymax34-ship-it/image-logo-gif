import type { BrandAsset, BrandLanguage, BrandLayerState, BrandSettingsV1, CprState, LogoGroupState } from '../../core';
import { BrandEffectControls, BrandGuideControls, BrandPanel, CprControls, LogoGroupControls, LogoStylePreview, SectionHeader } from '../../components';

export function BrandControlsPanel({ logoGroup, cprState, brandLayer, brandSettings, gameLogoAsset, onLanguageChange, onLogoChange, onCprChange, onBrandLayerChange, onSettingsChange, onApplyLogoSameAspect, onApplyLogoAll, onApplyCprSameAspect, onApplyCprAll }: {
  logoGroup: LogoGroupState; cprState: CprState; brandLayer: BrandLayerState; brandSettings: BrandSettingsV1;
  gameLogoAsset?: BrandAsset; onLanguageChange: (language: BrandLanguage) => void;
  onLogoChange: (logo: LogoGroupState) => void; onCprChange: (cpr: CprState) => void;
  onBrandLayerChange: (layer: BrandLayerState) => void; onSettingsChange: (settings: BrandSettingsV1) => void;
  onApplyLogoSameAspect?: () => void; onApplyLogoAll?: () => void; onApplyCprSameAspect?: () => void; onApplyCprAll?: () => void;
}) {
  return <BrandPanel>
    <section className="brand-control-group" aria-labelledby="logo-controls-title">
      <SectionHeader id="logo-controls-title" title="Logo" description="组合与单项资源" state={brandLayer.logoEnabled ? 'active' : 'disabled'} />
      <LogoGroupControls group={logoGroup} language={brandLayer.logoLanguage} onLanguageChange={onLanguageChange} onChange={onLogoChange} />
      <label className="toggle compact-toggle"><input type="checkbox" checked={brandLayer.logoEnabled} onChange={(event) => onBrandLayerChange({ ...brandLayer, logoEnabled: event.target.checked })} />显示 Logo</label>
      <BrandEffectControls title="Logo" effect={brandLayer.logoEffect} onChange={(logoEffect) => onBrandLayerChange({ ...brandLayer, logoEffect })} preview={<LogoStylePreview asset={gameLogoAsset} effect={brandLayer.logoEffect} />} />
      {onApplyLogoSameAspect || onApplyLogoAll ? <div className="brand-apply-actions"><span>应用范围</span>{onApplyLogoSameAspect ? <button type="button" onClick={onApplyLogoSameAspect}>同版型画板</button> : null}{onApplyLogoAll ? <button type="button" onClick={onApplyLogoAll}>全部画板</button> : null}</div> : null}
    </section>
    <CprControls state={cprState} onChange={onCprChange} onApplySameAspect={onApplyCprSameAspect} onApplyAll={onApplyCprAll} />
    <section className="brand-control-group" aria-labelledby="guide-controls-title">
      <SectionHeader id="guide-controls-title" title="辅助工具" description="画布显示与吸附" state={brandSettings.snapEnabled || brandSettings.gridVisible || brandSettings.guidesVisible || brandSettings.safeAreaVisible ? 'active' : 'idle'} />
      <BrandGuideControls settings={brandSettings} onChange={onSettingsChange} />
    </section>
  </BrandPanel>;
}
