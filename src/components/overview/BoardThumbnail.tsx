import { type KeyboardEvent } from 'react';
import {
  classifyAspect,
  createDefaultCprState,
  createDefaultLogoGroup,
  getBoardPreviewKey,
  resolveBoardBrandAssets,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1,
  type CprState,
  type LogoGroupState,
  type MaterialAsset,
  type MaterialSpec
} from '../../core';
import { BoardCanvas } from '../canvas';

function getAspectLabel(spec: MaterialSpec): string {
  const family = classifyAspect({ width: spec.width, height: spec.height });
  if (family === 'landscape') return '横版';
  if (family === 'portrait') return '竖版';
  return '方图';
}

function getPlacementLabel(placement: LogoGroupState['placement']): string {
  if (placement === 'corner-left') return '左上';
  if (placement === 'corner-right') return '右上';
  if (placement === 'center') return '居中';
  return '自定义';
}

export function BoardThumbnail({
  asset,
  spec,
  previewState,
  selected,
  brandCatalog,
  brandLayer,
  brandSettings,
  logoGroup,
  cprState,
  thumbnailWidth,
  onSelect,
  onEdit
}: {
  asset: MaterialAsset;
  spec: MaterialSpec;
  previewState?: BoardPreviewState;
  selected: boolean;
  brandCatalog: BrandAsset[];
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  logoGroup?: LogoGroupState;
  cprState?: CprState;
  thumbnailWidth: number;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const stageWidth = Math.max(120, thumbnailWidth - 18);
  const stageHeight = Math.max(104, Math.round(thumbnailWidth * 0.73));
  const scale = Math.min(stageWidth / spec.width, stageHeight / spec.height, 1);
  const aspectRatio = spec.width / spec.height;
  // Normal artwork thumbnails should reflect the guide controls. For extreme
  // diagnostic ratios, the guide density is not legible and can overwhelm the
  // fixed stage, so keep that special case visually quiet.
  const isExtremeAspect = aspectRatio > 5 || aspectRatio < 0.2;
  const thumbnailGuideSettings = isExtremeAspect
    ? { ...brandSettings, gridVisible: false, safeAreaVisible: false, guidesVisible: false }
    : brandSettings;
  const effectiveLogoGroup = logoGroup ?? createDefaultLogoGroup(brandLayer.logoLanguage);
  const effectiveCprState = cprState ?? createDefaultCprState();
  const assets = resolveBoardBrandAssets({
    boardBrandState: { logo: effectiveLogoGroup, cpr: effectiveCprState },
    brandCatalog,
    brandLayer
  });

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onEdit();
  }

  return (
    <article className={`board-card ${selected ? 'active' : ''}`} data-board-key={getBoardPreviewKey(asset.id, spec.id)}>
      <button
        type="button"
        className="board-card-button"
        onClick={onSelect}
        onDoubleClick={onEdit}
        onKeyDown={handleKeyDown}
        aria-pressed={selected}
        aria-label={`${asset.fileName}，${spec.name} ${spec.width} x ${spec.height}，双击调整`}
      >
        <div className="board-card-title">
          <strong>{spec.name}</strong>
          <small>{spec.width} x {spec.height} · {getPlacementLabel(effectiveLogoGroup.placement)}</small>
        </div>
        <div className="board-thumbnail-stage" style={{ width: stageWidth, height: stageHeight }}>
          <BoardCanvas
            asset={asset}
            spec={spec}
            previewState={previewState}
            logoAsset={assets.gameLogo}
            cprAsset={assets.cpr}
            brandLayer={{ ...brandLayer, logoGroup: effectiveLogoGroup, cprState: effectiveCprState, cprEnabled: effectiveCprState.enabled }}
            scale={scale}
            brandSettings={thumbnailGuideSettings}
            logoGroup={effectiveLogoGroup}
            overlayCompanyLogo={assets.companyLogo}
            overlayGameLogo={assets.gameLogo}
          />
        </div>
        <div className="board-card-footer">
          <span>{getAspectLabel(spec)}</span>
          <span>{previewState?.fitMode === 'contain' ? '适应' : '填满'}</span>
        </div>
      </button>
    </article>
  );
}
