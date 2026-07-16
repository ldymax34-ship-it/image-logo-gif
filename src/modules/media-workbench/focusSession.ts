import type { BoardBrandState, BoardPreviewState, BrandEffectState, CprState, LogoGroupState } from '../../core';

export type FocusTool = 'crop' | 'logo' | 'cpr';

export type FocusBrandLayerDraft = {
  logoEnabled: boolean;
  logoEffect: BrandEffectState;
};

export type BoardDocumentSnapshot = {
  previewState: BoardPreviewState;
  brand: BoardBrandState;
  brandLayer: FocusBrandLayerDraft;
};

export type FocusSession = {
  assetId: string;
  specId: string;
  boardKey: string;
  initial: BoardDocumentSnapshot;
  draft: BoardDocumentSnapshot;
  tool: FocusTool;
  dirty: boolean;
};

export function createFocusSession(assetId: string, specId: string, boardKey: string, initial: BoardDocumentSnapshot): FocusSession {
  const snapshot: BoardDocumentSnapshot = {
    previewState: { ...initial.previewState, crop: { ...initial.previewState.crop } },
    brand: {
      logo: { ...initial.brand.logo, manualOffset: initial.brand.logo.manualOffset ? { ...initial.brand.logo.manualOffset } : undefined },
      cpr: { ...initial.brand.cpr, transform: { ...initial.brand.cpr.transform }, effect: { ...initial.brand.cpr.effect } }
    },
    brandLayer: { logoEnabled: initial.brandLayer.logoEnabled, logoEffect: { ...initial.brandLayer.logoEffect } }
  };
  return { assetId, specId, boardKey, initial: snapshot, draft: structuredClone(snapshot), tool: 'crop', dirty: false };
}

export function isFocusSessionDirty(initial: BoardDocumentSnapshot, draft: BoardDocumentSnapshot): boolean {
  return JSON.stringify(initial) !== JSON.stringify(draft);
}

export function withFocusDraft(session: FocusSession, draft: BoardDocumentSnapshot): FocusSession {
  return { ...session, draft, dirty: isFocusSessionDirty(session.initial, draft) };
}

export function updateFocusLogo(session: FocusSession, logo: LogoGroupState): FocusSession {
  return withFocusDraft(session, { ...session.draft, brand: { ...session.draft.brand, logo } });
}

export function updateFocusCpr(session: FocusSession, cpr: CprState): FocusSession {
  return withFocusDraft(session, { ...session.draft, brand: { ...session.draft.brand, cpr } });
}

export function updateFocusBrandLayer(session: FocusSession, brandLayer: FocusBrandLayerDraft): FocusSession {
  return withFocusDraft(session, { ...session.draft, brandLayer });
}
