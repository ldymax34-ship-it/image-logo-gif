import type { BrandAsset, BrandLanguage, BrandLayerState } from './brandAsset';
import type { BoardBrandState } from './brandTypes';

export type BoardBrandAssetResolution = {
  language: BrandLanguage;
  gameLogo?: BrandAsset;
  companyLogo?: BrandAsset;
  cpr?: BrandAsset;
  missingGameLogo: boolean;
  missingCpr: boolean;
};

/**
 * Resolve the assets for one board render. Game logos are deliberately exact
 * language matches: a board must never silently render another locale.
 */
export function resolveBoardBrandAssets({
  boardBrandState,
  brandCatalog,
  brandLayer,
  languageOverride
}: {
  boardBrandState: BoardBrandState;
  brandCatalog: BrandAsset[];
  brandLayer: BrandLayerState;
  languageOverride?: BrandLanguage;
}): BoardBrandAssetResolution {
  const language = languageOverride ?? boardBrandState.logo.gameLogoLanguage;
  const requestedGameLogoId = languageOverride ? undefined : boardBrandState.logo.gameLogoId;
  const requestedGameLogo = requestedGameLogoId
    ? brandCatalog.find((asset) => asset.id === requestedGameLogoId && asset.type === 'logo' && asset.language === language)
    : undefined;
  const gameLogo = requestedGameLogo
    ?? brandCatalog.find((asset) => asset.type === 'logo' && asset.language === language);
  const companyLogo = boardBrandState.logo.companyLogoId
    ? brandCatalog.find((asset) => asset.id === boardBrandState.logo.companyLogoId && asset.type === 'logo')
    : brandCatalog.find((asset) => asset.type === 'logo' && asset.language === 'custom');
  const cpr = brandLayer.selectedCprId
    ? brandCatalog.find((asset) => asset.id === brandLayer.selectedCprId && asset.type === 'cpr')
    : brandCatalog.find((asset) => asset.type === 'cpr' && asset.language === brandLayer.cprLanguage);

  return {
    language,
    gameLogo,
    companyLogo,
    cpr,
    missingGameLogo: brandLayer.logoEnabled && boardBrandState.logo.mode !== 'company-only' && !gameLogo,
    missingCpr: brandLayer.cprEnabled && boardBrandState.cpr.enabled && !cpr
  };
}
