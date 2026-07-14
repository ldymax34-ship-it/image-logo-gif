import { type CSSProperties, useState } from 'react';
import {
  type BoardPreviewState,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1,
  type LogoGroupState,
  type MaterialAsset,
  type MaterialSpec
} from '../../core';
import { AssetBoardGroup } from './AssetBoardGroup';
import { ThumbnailSizeControl } from './ThumbnailSizeControl';

export function MultiAssetBoardOverview({
  assets,
  specs,
  previewStates,
  selectedAssetId,
  selectedSpecId,
  logoAsset,
  cprAsset,
  brandLayer,
  brandSettings,
  logoGroup,
  logoGroupsByBoard,
  companyLogo,
  gameLogo,
  onSelect,
  onEdit,
  onDelete
}: {
  assets: MaterialAsset[];
  specs: MaterialSpec[];
  previewStates: Record<string, BoardPreviewState>;
  selectedAssetId?: string;
  selectedSpecId?: string;
  logoAsset?: BrandAsset;
  cprAsset?: BrandAsset;
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  logoGroup: LogoGroupState;
  logoGroupsByBoard: Record<string, LogoGroupState>;
  companyLogo?: BrandAsset;
  gameLogo?: BrandAsset;
  onSelect: (assetId: string, specId: string) => void;
  onEdit: (assetId: string, specId: string) => void;
  onDelete: (assetId: string) => void;
}) {
  const [thumbnailWidth, setThumbnailWidth] = useState(220);

  if (!assets.length || !specs.length) {
    return <div className="empty-state">上传素材并应用尺寸后，会在这里按素材显示全部画板。</div>;
  }

  return (
    <div className="preview-shell multi-asset-overview">
      <div className="preview-meta preview-meta-overview">
        <span>{assets.length} 张素材 · {assets.length * specs.length} 个画板</span>
        <div className="preview-overview-tools">
          <span>单击选择，双击调整</span>
          <ThumbnailSizeControl value={thumbnailWidth} onChange={setThumbnailWidth} />
        </div>
      </div>
      <div className="asset-board-groups" style={{ '--thumbnail-width': `${thumbnailWidth}px` } as CSSProperties}>
        {assets.map((asset) => (
          <AssetBoardGroup
            key={asset.id}
            asset={asset}
            specs={specs}
            previewStates={previewStates}
            selectedAssetId={selectedAssetId}
            selectedSpecId={selectedSpecId}
            logoAsset={logoAsset}
            cprAsset={cprAsset}
            brandLayer={brandLayer}
            brandSettings={brandSettings}
            logoGroup={logoGroup}
            logoGroupsByBoard={logoGroupsByBoard}
            companyLogo={companyLogo}
            gameLogo={gameLogo}
            thumbnailWidth={thumbnailWidth}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
