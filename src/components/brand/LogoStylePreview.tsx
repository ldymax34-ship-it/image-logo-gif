import type { BrandAsset, BrandEffectState } from '../../core';
import { SvgImageLayer, buildLayerFilter } from '../canvas';

export function LogoStylePreview({ asset, effect }: { asset?: BrandAsset; effect: BrandEffectState }) {
  return (
    <div className="logo-style-preview" aria-label="Logo 单项样式预览">
      {asset ? (
        <span style={{ filter: buildLayerFilter(effect, 0.65) }}>
          <SvgImageLayer asset={asset} className="logo-style-preview-image" effect={effect} />
        </span>
      ) : <small>选择 Logo 后显示预览</small>}
    </div>
  );
}
