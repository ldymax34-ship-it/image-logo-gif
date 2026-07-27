import { type PointerEvent } from 'react';
import {
  buildBoardRenderPlan,
  resolveCprState,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1,
  type LogoGroupState,
  type BoardPreviewState,
  type MaterialAsset,
  type MaterialSpec,
  type WatermarkConfig
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
  showImage = true,
  transparent = false,
  draggable,
  brandSettings,
  logoGroup,
  overlayCompanyLogo,
  overlayGameLogo,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  watermarkConfig,
  hideWatermark = false
}: {
  asset: MaterialAsset | undefined;
  spec: MaterialSpec;
  previewState: BoardPreviewState | undefined;
  logoAsset: BrandAsset | undefined;
  cprAsset: BrandAsset | undefined;
  brandLayer: BrandLayerState;
  scale: number;
  showImage?: boolean;
  transparent?: boolean;
  draggable?: boolean;
  brandSettings?: BrandSettingsV1;
  logoGroup?: LogoGroupState;
  overlayCompanyLogo?: BrandAsset;
  overlayGameLogo?: BrandAsset;
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
  onWheel?: (event: React.WheelEvent<HTMLDivElement>) => void;
  watermarkConfig?: WatermarkConfig;
  hideWatermark?: boolean;
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
        gameLogoAsset: overlayGameLogo,
        watermarkConfig
      })
    : undefined;

  const showOverlay = Boolean(brandSettings && logoGroup);

  return (
    <div
      className={`preview-canvas board-canvas ${draggable ? 'is-draggable' : ''} ${transparent ? 'is-transparent' : ''}`}
      style={{ width: spec.width * scale, height: spec.height * scale }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      {plan ? (
        <>
          {showImage ? <img
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
          /> : null}
          {showImage && brandSettings?.safeAreaVisible !== false ? (
            <div className="safe-area" style={{
              left: plan.safeArea.x * scale,
              top: plan.safeArea.y * scale,
              width: plan.safeArea.width * scale,
              height: plan.safeArea.height * scale
            }} />
          ) : null}
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
          cprState={resolveCprState(brandLayer)}
              scale={scale}
            />
          ) : null}
          {!hideWatermark ? plan.watermarkLayers.map((layer) => (
            layer.kind === 'text' ? (
              <div key={layer.id} className="watermark-layer" style={{
                left: layer.cx * scale, top: layer.cy * scale,
                fontFamily: layer.fontFamily, fontSize: layer.fontSize * scale,
                color: layer.color, opacity: layer.opacity,
                transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`
              }}>{layer.text}</div>
            ) : (
              <img key={layer.id} className="watermark-layer watermark-image-layer" src={layer.src} alt="" draggable={false} style={{
                left: layer.cx * scale, top: layer.cy * scale,
                width: layer.width * scale, height: layer.height * scale,
                opacity: layer.opacity,
                transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`
              }} />
            )
          )) : null}
        </>
      ) : (
        <div className="canvas-placeholder">上传图片</div>
      )}
    </div>
  );
}
