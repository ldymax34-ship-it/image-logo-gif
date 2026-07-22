import { getBrandAssetUrl, getBrandLanguageLabel, type BrandAsset, type BrandLanguage } from '../../core';

const GAME_LANGUAGES: BrandLanguage[] = ['zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'en-US'];

function ResourcePreview({ asset }: { asset?: BrandAsset }) {
  if (!asset) return <span className="resource-preview-empty">未设置</span>;
  const source = getBrandAssetUrl(asset);
  return <img src={source.url} alt={asset.name} onLoad={() => source.revoke && URL.revokeObjectURL(source.url)} onError={() => source.revoke && URL.revokeObjectURL(source.url)} />;
}

export function BrandResourceManager({
  assets,
  selectedLogoId,
  selectedCompanyLogoId,
  onSelect,
  onReplace,
  onRestore
}: {
  assets: BrandAsset[];
  selectedLogoId?: string;
  selectedCompanyLogoId?: string;
  onSelect: (asset: BrandAsset) => void;
  onReplace: (asset: BrandAsset | undefined, language: BrandLanguage) => void;
  onRestore: () => void;
}) {
  const logos = assets.filter((asset) => asset.type === 'logo');
  const company = logos.find((asset) => asset.id === selectedCompanyLogoId)
    ?? logos.find((asset) => asset.language === 'custom');
  const games = GAME_LANGUAGES.map((language) => ({ language, asset: logos.find((asset) => asset.language === language) }));

  return <section className="brand-resource-manager" aria-label="Logo 资源">
    <div className="brand-resource-manager-heading"><div><h3>Logo 资源</h3><small>替换后仅保存在当前工作区</small></div><button type="button" onClick={onRestore}>恢复内置资源</button></div>
    <div className="brand-resource-row">
      <ResourcePreview asset={company} />
      <div><strong>公司 Logo</strong><small>{company?.name ?? '未设置'}</small></div>
      <button type="button" onClick={() => onReplace(company, 'custom')}>替换</button>
    </div>
    {games.map(({ language, asset }) => <div key={language} className={`brand-resource-row ${asset?.id === selectedLogoId ? 'active' : ''}`}>
      <button type="button" className="resource-select" onClick={() => asset && onSelect(asset)} disabled={!asset} aria-label={`选择${getBrandLanguageLabel(language)}游戏 Logo`}><ResourcePreview asset={asset} /></button>
      <div><strong>{getBrandLanguageLabel(language)}游戏 Logo</strong><small>{asset?.name ?? '未设置'}</small></div>
      <button type="button" onClick={() => onReplace(asset, language)}>替换</button>
    </div>)}
  </section>;
}
