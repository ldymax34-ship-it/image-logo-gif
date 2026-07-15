import type { BrandAsset, BrandLanguage, BrandLayerState, BrandSettingsV1, CprState, LogoGroupState } from '../../core';
import { BrandEffectControls, BrandGuideControls, BrandPanel, CprControls, LogoGroupControls, LogoStylePreview } from '../../components';

export function BrandControlsPanel({ logoGroup, cprState, brandLayer, brandSettings, gameLogoAsset, onLanguageChange, onLogoChange, onCprChange, onBrandLayerChange, onSettingsChange }: {
  logoGroup: LogoGroupState; cprState: CprState; brandLayer: BrandLayerState; brandSettings: BrandSettingsV1;
  gameLogoAsset?: BrandAsset; onLanguageChange: (language: BrandLanguage) => void;
  onLogoChange: (logo: LogoGroupState) => void; onCprChange: (cpr: CprState) => void;
  onBrandLayerChange: (layer: BrandLayerState) => void; onSettingsChange: (settings: BrandSettingsV1) => void;
}) {
  return <BrandPanel>
    <section className="brand-control-group" aria-labelledby="logo-controls-title">
      <div className="brand-control-heading"><div><h3 id="logo-controls-title">Logo</h3><small>组合与单项资源</small></div></div>
      <LogoGroupControls group={logoGroup} language={brandLayer.logoLanguage} onLanguageChange={onLanguageChange} onChange={onLogoChange} />
      <label className="toggle compact-toggle"><input type="checkbox" checked={brandLayer.logoEnabled} onChange={(event) => onBrandLayerChange({ ...brandLayer, logoEnabled: event.target.checked })} />显示 Logo</label>
      <BrandEffectControls title="Logo" effect={brandLayer.logoEffect} onChange={(logoEffect) => onBrandLayerChange({ ...brandLayer, logoEffect })} preview={<LogoStylePreview asset={gameLogoAsset} effect={brandLayer.logoEffect} />} />
    </section>
    <CprControls state={cprState} onChange={onCprChange} />
    <section className="brand-control-group" aria-labelledby="guide-controls-title">
      <div className="brand-control-heading"><div><h3 id="guide-controls-title">辅助工具</h3><small>画布显示与吸附</small></div></div>
      <BrandGuideControls settings={brandSettings} onChange={onSettingsChange} />
    </section>
  </BrandPanel>;
}
