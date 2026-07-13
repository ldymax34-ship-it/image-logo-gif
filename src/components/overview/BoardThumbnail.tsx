import { type KeyboardEvent } from 'react';
import {
  classifyAspect,
  getBoardPreviewKey,
  type BoardPreviewState,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1,
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

export function BoardThumbnail({
  asset,
  spec,
  previewState,
  selected,
  logoAsset,
  cprAsset,
  brandLayer,
  brandSettings,
  logoGroup,
  companyLogo,
  gameLogo,
  onSelect,
  onEdit
}: {
  asset: MaterialAsset;
  spec: MaterialSpec;
  previewState?: BoardPreviewState;
  selected: boolean;
  logoAsset?: BrandAsset;
  cprAsset?: BrandAsset;
  brandLayer: BrandLayerState;
  brandSettings: BrandSettingsV1;
  logoGroup: LogoGroupState;
  companyLogo?: BrandAsset;
  gameLogo?: BrandAsset;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const scale = Math.min(220 / spec.width, 160 / spec.height, 1);

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
          <small>{spec.width} x {spec.height}</small>
        </div>
        <BoardCanvas
          asset={asset}
          spec={spec}
          previewState={previewState}
          logoAsset={logoAsset}
          cprAsset={cprAsset}
          brandLayer={{ ...brandLayer, logoGroup }}
          scale={scale}
          brandSettings={brandSettings}
          logoGroup={logoGroup}
          overlayCompanyLogo={companyLogo}
          overlayGameLogo={gameLogo}
        />
        <div className="board-card-footer">
          <span>{getAspectLabel(spec)}</span>
          <span>{previewState?.fitMode === 'contain' ? '适应' : '填满'}</span>
        </div>
      </button>
    </article>
  );
}
