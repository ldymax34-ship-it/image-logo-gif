import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup, resolveBoardBrandAssets, type BrandAsset, type BrandLayerState } from '../../core';

const catalog: BrandAsset[] = [
  { id: 'cn', type: 'logo', sourceKind: 'image', name: 'cn', language: 'zh-CN' },
  { id: 'en', type: 'logo', sourceKind: 'image', name: 'en', language: 'en-US' },
  { id: 'company', type: 'logo', sourceKind: 'image', name: 'company', language: 'custom' },
  { id: 'cpr', type: 'cpr', sourceKind: 'svg', name: 'cpr', language: 'custom' }
];

const layer: BrandLayerState = {
  logoEnabled: true, cprEnabled: true, logoLanguage: 'zh-CN', cprLanguage: 'custom', selectedCprId: 'cpr',
  logoAnchor: 'top-right', cprAnchor: 'top-right', logoSize: 'standard', cprSize: 'standard',
  logoEffect: {} as BrandLayerState['logoEffect'], cprEffect: {} as BrandLayerState['cprEffect']
};

describe('resolveBoardBrandAssets', () => {
  it('uses the board language and does not fall back to another game logo language', () => {
    const board = { logo: { ...createDefaultLogoGroup('en-US'), gameLogoId: 'en', companyLogoId: 'company' }, cpr: createDefaultCprState() };
    expect(resolveBoardBrandAssets({ boardBrandState: board, brandCatalog: catalog, brandLayer: layer }).gameLogo?.id).toBe('en');
    expect(resolveBoardBrandAssets({ boardBrandState: board, brandCatalog: catalog, brandLayer: layer, languageOverride: 'zh-TW' }).gameLogo).toBeUndefined();
  });

  it('uses language override only for that render without mutating board language', () => {
    const board = { logo: { ...createDefaultLogoGroup('zh-CN'), gameLogoId: 'cn' }, cpr: createDefaultCprState() };
    const resolved = resolveBoardBrandAssets({ boardBrandState: board, brandCatalog: catalog, brandLayer: layer, languageOverride: 'en-US' });
    expect(resolved.gameLogo?.id).toBe('en');
    expect(board.logo.gameLogoLanguage).toBe('zh-CN');
  });
});
