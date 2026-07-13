import { getBrandLanguageLabel, type BrandAsset } from '../../core';

export function BrandAssetList({
  assets,
  selectedId,
  onSelect
}: {
  assets: BrandAsset[];
  selectedId: string | undefined;
  onSelect: (asset: BrandAsset) => void;
}) {
  if (!assets.length) {
    return <div className="mini-empty">未导入 SVG</div>;
  }
  return (
    <div className="brand-list">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          className={`brand-row ${asset.id === selectedId ? 'active' : ''}`}
          onClick={() => onSelect(asset)}
        >
          <span>
            <strong>{asset.name}</strong>
            <small>
              {asset.sourceKind.toUpperCase()} · {getBrandLanguageLabel(asset.language)}
              {asset.viewBoxSize ? ` · ${Math.round(asset.viewBoxSize.width)}x${Math.round(asset.viewBoxSize.height)}` : ''}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}
