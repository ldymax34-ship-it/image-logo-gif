import { buildBrandRenderPlan, type BrandAsset, type BrandSettingsV1, type LogoGroupState } from '../../core';

export type BrandOverlayOptions = {
  canvas: { width: number; height: number };
  settings: BrandSettingsV1;
  group: LogoGroupState;
  companyLogo?: BrandAsset;
  gameLogo?: BrandAsset;
  scale: number;
};

function positionToAnchor(placement: LogoGroupState['placement']): 'top-left' | 'top-right' | 'center' {
  if (placement === 'corner-left') return 'top-left';
  if (placement === 'corner-right') return 'top-right';
  return 'center';
}

export function BrandOverlay({ canvas, settings, group, companyLogo, gameLogo, scale }: BrandOverlayOptions) {
  if (!settings.gridVisible && !settings.safeAreaVisible && !settings.guidesVisible) {
    return null;
  }

  const plan = buildBrandRenderPlan(canvas, group, {
    companyLogo,
    gameLogo,
    cprEnabled: settings.cprEnabled
  });

  return (
    <div className="brand-overlay" aria-hidden="true">
      {settings.guidesVisible
        ? plan.guideLines.map((line, index) => {
            const isGrid = line.kind === 'grid' || line.kind === 'half-grid';
            if (isGrid && !settings.gridVisible) return null;
            if (line.kind === 'safe' && !settings.safeAreaVisible) return null;
            if (line.axis === 'x') {
              return (
                <span
                  key={`gx-${index}`}
                  className={`brand-guide brand-guide-x brand-guide-${line.kind}`}
                  style={{ left: line.position * scale }}
                />
              );
            }
            return (
              <span
                key={`gy-${index}`}
                className={`brand-guide brand-guide-y brand-guide-${line.kind}`}
                style={{ top: line.position * scale }}
              />
            );
          })
        : null}

      {settings.safeAreaVisible ? (
        <span
          className="brand-overlay-safe"
          style={{
            left: plan.safeArea.x * scale,
            top: plan.safeArea.y * scale,
            width: plan.safeArea.width * scale,
            height: plan.safeArea.height * scale
          }}
        />
      ) : null}

      {plan.logoGroupRect ? (
        <span
          className="brand-overlay-group"
          style={{
            left: plan.logoGroupRect.x * scale,
            top: plan.logoGroupRect.y * scale,
            width: plan.logoGroupRect.width * scale,
            height: plan.logoGroupRect.height * scale
          }}
        >
          <small className="brand-overlay-label">{positionToAnchor(group.placement)}</small>
        </span>
      ) : null}

      {plan.cpr ? (
        <span
          className="brand-overlay-cpr"
          style={{
            left: plan.cpr.rect.x * scale,
            top: plan.cpr.rect.y * scale,
            width: plan.cpr.rect.width * scale,
            height: plan.cpr.rect.height * scale
          }}
        />
      ) : null}
    </div>
  );
}
