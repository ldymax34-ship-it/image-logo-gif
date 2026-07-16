import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup } from '../../core';
import { createFocusSession, updateFocusCpr, updateFocusLogo } from './focusSession';

describe('FocusSession', () => {
  it('keeps the committed board document unchanged until the session is committed', () => {
    const initial = {
      previewState: { assetId: 'asset', specId: 'spec', fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } },
      brand: { logo: createDefaultLogoGroup(), cpr: createDefaultCprState() }
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
