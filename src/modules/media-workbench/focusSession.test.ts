import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup } from '../../core';
import { createFocusSession, updateFocusBrandLayer, updateFocusCpr, updateFocusLogo } from './focusSession';

describe('FocusSession', () => {
  it('keeps the committed board document unchanged until the session is committed', () => {
    const initial = {
      previewState: { assetId: 'asset', specId: 'spec', fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } },
      brand: { logo: createDefaultLogoGroup(), cpr: createDefaultCprState() }, brandLayer: { logoEnabled: true, logoEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 } }
    };
    const session = createFocusSession('asset', 'spec', 'asset:spec', initial);
    const withLogo = updateFocusLogo(session, { ...session.draft.brand.logo, scale: 1.4 });
    const withCpr = updateFocusCpr(withLogo, { ...withLogo.draft.brand.cpr, transform: { ...withLogo.draft.brand.cpr.transform, offsetY: 18 } });

    expect(withCpr.dirty).toBe(true);
    expect(withCpr.initial.brand.logo.scale).toBe(1);
    expect(withCpr.initial.brand.cpr.transform.offsetY).toBe(0);
    expect(initial.brand.logo.scale).toBe(1);
  });
});

  it('keeps global logo visibility and effects in the focus draft until save', () => {
    const initial = {
      previewState: { assetId: 'asset', specId: 'spec', fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } },
      brand: { logo: createDefaultLogoGroup(), cpr: createDefaultCprState() },
      brandLayer: { logoEnabled: true, logoEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 } }
    };
    const session = createFocusSession('asset', 'spec', 'asset:spec', initial);
    const changed = updateFocusBrandLayer(session, { ...session.draft.brandLayer, logoEnabled: false });
    expect(changed.dirty).toBe(true);
    expect(changed.initial.brandLayer.logoEnabled).toBe(true);
    expect(initial.brandLayer.logoEnabled).toBe(true);
  });
