import { describe, expect, it } from 'vitest';
import { buildBrandRenderPlan, createDefaultCprState, createDefaultLogoGroup } from '../../core';
import { createFocusSession, rebaseFocusCpr, rebaseFocusLogo, updateFocusBrandLayer, updateFocusCpr, updateFocusLogo } from './focusSession';
import { clampFocusViewZoom, getFocusHitTarget } from './FocusWorkspace';

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


describe('Focus canvas hit targets', () => {
  it('clamps the view-only zoom control without touching the board draft', () => {
    expect(clampFocusViewZoom(0)).toBe(25);
    expect(clampFocusViewZoom(187.6)).toBe(188);
    expect(clampFocusViewZoom(999)).toBe(300);
  });

  it('selects CPR before Logo and otherwise selects crop', () => {
    const logo = { id: 'logo', type: 'logo' as const, sourceKind: 'image' as const, name: 'logo', language: 'zh-CN' as const, aspectRatio: 2 };
    const cpr = { id: 'cpr', type: 'cpr' as const, sourceKind: 'image' as const, name: 'cpr', language: 'custom' as const, aspectRatio: 4 };
    const plan = buildBrandRenderPlan({ width: 1920, height: 1080 }, { ...createDefaultLogoGroup(), placement: 'center' }, { gameLogo: logo, cpr: createDefaultCprState() });
    expect(getFocusHitTarget({ x: plan.logoGroupRect!.x + 1, y: plan.logoGroupRect!.y + 1 }, plan)).toBe('logo');
    expect(getFocusHitTarget({ x: plan.cpr!.rect.x + 1, y: plan.cpr!.rect.y + 1 }, plan)).toBe('cpr');
    expect(getFocusHitTarget({ x: 2, y: 2 }, plan)).toBe('crop');
  });
});


describe('Focus scope baseline', () => {
  it('rebases only an applied section and keeps other draft edits dirty', () => {
    const initial = { previewState: { assetId: 'a', specId: 's', fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } }, brand: { logo: createDefaultLogoGroup(), cpr: createDefaultCprState() }, brandLayer: { logoEnabled: true, logoEffect: { colorEnabled: false, color: '#fff', strokeEnabled: false, strokeColor: '#000', strokeWidth: 0, glowEnabled: false, glowColor: '#fff', glowBlur: 0, shadowEnabled: false, shadowColor: '#000', shadowOpacity: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 } } };
    const session = createFocusSession('a', 's', 'a:s', initial);
    const changed = updateFocusCpr(updateFocusLogo(session, { ...session.draft.brand.logo, scale: 1.2 }), { ...session.draft.brand.cpr, scale: 1.3 });
    expect(rebaseFocusLogo(changed).dirty).toBe(true);
    expect(rebaseFocusCpr(rebaseFocusLogo(changed)).dirty).toBe(false);
  });
});
