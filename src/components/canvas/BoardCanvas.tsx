import { type PointerEvent } from 'react';
import {
  buildBoardRenderPlan,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1,
  type LogoGroupState,
  type BoardPreviewState,
  type MaterialAsset,
  type MaterialSpec
} from '../../core';
import { SvgImageLayer, buildLayerFilter } from './SvgImageLayer';
import { BrandOverlay } from './BrandOverlay';

export function BoardCanvas({
  asset,
  spec,
  previewState,
  logoAsset,
  cprAsset,
  brandLayer,
  scale,
  draggable,
  brandSettings,
  logoGroup,
  overlayCompanyLogo,
  overlayGameLogo,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: {
  asset: MaterialAsset | undefined;
  spec: MaterialSpec;
  previewState: BoardPreviewState | undefined;
  logoAsset: BrandAsset | undefined;
  cprAsset: BrandAsset | undefined;
  brandLayer: BrandLayerState;
  scale: number;
  draggable?: boolean;
  brandSettings?: BrandSettingsV1;
  logoGroup?: LogoGroupState;
  overlayCompanyLogo?: BrandAsset;
  overlayGameLogo?: BrandAsset;
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const plan = asset && previewState
    ? buildBoardRenderPlan({
        asset,
        spec,
        previewState,
        brandLayer,
        logoAsset,
        cprAsset,
        companyLogoAsset: overlayCompanyLogo,
        gameLogoAsset: overlayGameLogo
      })
    : undefined;

  const showOverlay = Boolean(brandSettings && logoGroup);

  return (
    <div
      className={`preview-canvas board-canvas ${draggable ? 'is-draggable' : ''}`}
      style={{ width: spec.width * scale, height: spec.height * scale }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {plan ? (
        <>
          <img
            className="preview-image"
            src={plan.image.src}
            alt={plan.image.alt}
            draggable={false}
            style={{
              left: plan.image.rect.x * scale,
              top: plan.image.rect.y * scale,
              width: plan.image.rect.width * scale,
              height: plan.image.rect.height * scale
            }}
          />
          {brandSettings?.safeAreaVisible === false ? null : <div className="safe-area" />}
          {plan.layers.map((layer) => (
            <div
              key={layer.id}
              className={`brand-layer ${layer.type}`}
              style={{
                left: layer.rect.x * scale,
                top: layer.rect.y * scale,
                width: layer.rect.width * scale,
                height: layer.rect.height * scale,
                zIndex: layer.zIndex,
                filter: buildLayerFilter(layer.effect, scale)
              }}
            >
              <SvgImageLayer asset={layer.asset} className={`brand-svg ${layer.type}`} effect={layer.effect} />
            </div>
          ))}
          {showOverlay && brandSettings && logoGroup ? (
            <BrandOverlay
              canvas={{ width: spec.width, height: spec.height }}
              settings={brandSettings}
              group={logoGroup}
              companyLogo={overlayCompanyLogo}
              gameLogo={overlayGameLogo}
              scale={scale}
            />
          ) : null}
        </>
      ) : (
        <div className="canvas-placeholder">上传图片</div>
      )}
    </div>
  );
}
