import { useEffect, useState } from 'react';
import {
  formatFileSize,
  getBoardPreviewKey,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1,
  type BoardBrandStateMap,
  type MaterialAsset,
  type MaterialSpec
} from '../../core';
import { BoardThumbnail } from './BoardThumbnail';

export function AssetBoardGroup({
  asset,
  specs,
  previewStates,
  selectedAssetId,
  selectedSpecId,
  logoAsset,
  cprAsset,
  brandLayer,
  brandSettings,
  boardBrandStates,
  companyLogo,
  gameLogo,
  thumbnailWidth,
  onSelect,
  onEdit,
  onDelete
}: {
  asset: MaterialAsset;
  specs: MaterialSpec[];
  previewStates: Record<string, BoardPreviewState>;
  selectedAssetId?: string;
  selectedSpecId?: string;
  logoAsset?: BrandAsset;
  cprAsset?: BrandAsset;
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  boardBrandStates: BoardBrandStateMap;
  companyLogo?: BrandAsset;
  gameLogo?: BrandAsset;
  thumbnailWidth: number;
  onSelect: (assetId: string, specId: string) => void;
  onEdit: (assetId: string, specId: string) => void;
  onDelete: (assetId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const active = selectedAssetId === asset.id;

  useEffect(() => {
    if (active) setCollapsed(false);
  }, [active]);

  return (
    <section
      id={`asset-board-group-${asset.id}`}
      className={`asset-board-group ${active ? 'active' : ''}`}
      data-asset-id={asset.id}
      aria-labelledby={`asset-group-title-${asset.id}`}
    >
      <header className="asset-group-header">
        <img src={asset.objectUrl} alt="" />
        <div className="asset-group-title">
          <strong id={`asset-group-title-${asset.id}`}>{asset.fileName}</strong>
          <small>{asset.width} x {asset.height} · {formatFileSize(asset.fileSize)} · {specs.length} 个画板</small>
        </div>
        <button
          type="button"
          className="asset-group-toggle icon-button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? '展开' : '折叠'} ${asset.fileName}`}
          title={collapsed ? '展开素材画板' : '折叠素材画板'}
        >
          <span aria-hidden="true">{collapsed ? '›' : '⌄'}</span>
        </button>
        <button type="button" className="asset-group-delete icon-button" onClick={() => onDelete(asset.id)} aria-label={`删除素材 ${asset.fileName}`} title="删除素材">×</button>
      </header>
      {!collapsed ? (
        <div className="asset-board-grid">
          {specs.map((spec) => (
            <BoardThumbnail
              key={spec.id}
              asset={asset}
              spec={spec}
              previewState={previewStates[getBoardPreviewKey(asset.id, spec.id)]}
              selected={active && selectedSpecId === spec.id}
              logoAsset={logoAsset}
              cprAsset={cprAsset}
              brandLayer={brandLayer}
              brandSettings={brandSettings}
              logoGroup={boardBrandStates[getBoardPreviewKey(asset.id, spec.id)]?.logo}
              cprState={boardBrandStates[getBoardPreviewKey(asset.id, spec.id)]?.cpr}
              companyLogo={companyLogo}
              gameLogo={gameLogo}
              thumbnailWidth={thumbnailWidth}
              onSelect={() => onSelect(asset.id, spec.id)}
              onEdit={() => onEdit(asset.id, spec.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
