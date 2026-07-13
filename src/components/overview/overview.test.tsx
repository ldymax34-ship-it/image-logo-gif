import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAND_ASSETS,
  DEFAULT_BRAND_SETTINGS,
  DEFAULT_CPR_EFFECT,
  DEFAULT_LOGO_EFFECT,
  createDefaultLogoGroup,
  createInitialCropState,
  getBoardPreviewKey,
  type BrandLayerState,
  type MaterialAsset,
  type MaterialSpec
} from '../../core';
import { MultiAssetBoardOverview } from './BoardOverview';

describe('multi asset overview', () => {
  it('renders every asset group and every asset/spec board pair', () => {
    const assets: MaterialAsset[] = Array.from({ length: 3 }, (_, index) => ({
      id: `asset-${index}`,
      fileName: `asset-${index}.png`,
      objectUrl: `/asset-${index}.png`,
      width: 1920,
      height: 1080,
      fileSize: 1024,
      mimeType: 'image/png'
    }));
    const specs: MaterialSpec[] = [
      { id: 'landscape', name: '横版', width: 1920, height: 1080, format: 'jpg' },
      { id: 'square', name: '方图', width: 1080, height: 1080, format: 'jpg' },
      { id: 'portrait', name: '竖版', width: 1080, height: 1920, format: 'jpg' }
    ];
    const previewStates = Object.fromEntries(
      assets.flatMap((asset) => specs.map((spec) => [
        getBoardPreviewKey(asset.id, spec.id),
        {
          assetId: asset.id,
          specId: spec.id,
          fitMode: 'cover' as const,
          crop: createInitialCropState(asset, spec, 'cover')
        }
      ]))
    );
    const logoGroup = createDefaultLogoGroup('zh-CN');
    const logoGroupsByBoard = Object.fromEntries(Object.keys(previewStates).map((key) => [key, logoGroup]));
    const brandLayer: BrandLayerState = {
      logoEnabled: false,
      cprEnabled: false,
      logoLanguage: 'zh-CN',
      cprLanguage: 'custom',
      logoAnchor: 'top-right',
      cprAnchor: 'top-right',
      logoSize: 'standard',
      cprSize: 'standard',
      logoEffect: DEFAULT_LOGO_EFFECT,
      cprEffect: DEFAULT_CPR_EFFECT,
      logoGroup
    };
    const markup = renderToStaticMarkup(
      <MultiAssetBoardOverview
        assets={assets}
        specs={specs}
        previewStates={previewStates}
        selectedAssetId="asset-1"
        selectedSpecId="square"
        logoAsset={DEFAULT_BRAND_ASSETS.find((asset) => asset.type === 'logo')}
        cprAsset={DEFAULT_BRAND_ASSETS.find((asset) => asset.type === 'cpr')}
        brandLayer={brandLayer}
        brandSettings={DEFAULT_BRAND_SETTINGS}
        logoGroup={logoGroup}
        logoGroupsByBoard={logoGroupsByBoard}
        onSelect={() => undefined}
        onEdit={() => undefined}
      />
    );

    expect((markup.match(/data-asset-id=/g) ?? [])).toHaveLength(3);
    expect((markup.match(/data-board-key=/g) ?? [])).toHaveLength(9);
    expect(markup).toContain('asset-board-group active');
    expect(markup).toContain('asset-1:square');
  });
});
