import { useEffect, useMemo } from 'react';
import { getBrandAssetUrl, type BrandAsset, type BrandEffectState } from '../../core';
import { buildDropShadowFilter } from './effectFilter';

export function SvgImageLayer({
  asset,
  className,
  effect
}: {
  asset: BrandAsset;
  className: string;
  effect: BrandEffectState;
}) {
  const media = useMemo(() => getBrandAssetUrl(asset), [asset]);

  useEffect(() => {
    return () => {
      if (media.revoke) URL.revokeObjectURL(media.url);
    };
  }, [media]);

  if (effect.colorEnabled) {
    return (
      <span
        className={`${className} brand-mask`}
        style={{
          backgroundColor: effect.color,
          WebkitMaskImage: `url("${media.url}")`,
          maskImage: `url("${media.url}")`
        }}
      />
    );
  }

  return <img className={className} src={media.url} alt={asset.name} draggable={false} />;
}

export function buildLayerFilter(effect: BrandEffectState, scale = 1): string | undefined {
  return buildDropShadowFilter(effect, scale);
}
