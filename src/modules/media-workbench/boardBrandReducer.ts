import type { BoardBrandState, BoardBrandStateMap, CanvasSize, CprState, LogoGroupState } from '../../core';
import { normalizeCprForTarget, normalizeLogoForTarget } from './syncScope';

function cloneLogo(logo: LogoGroupState): LogoGroupState {
  return { ...logo, manualOffset: logo.manualOffset ? { ...logo.manualOffset } : undefined };
}

function cloneCpr(cpr: CprState): CprState {
  return { ...cpr, scale: cpr.scale ?? 1, transform: { ...cpr.transform }, effect: { ...cpr.effect } };
}

function cloneBoard(board: BoardBrandState): BoardBrandState {
  return { logo: cloneLogo(board.logo), cpr: cloneCpr(board.cpr), logoEnabled: board.logoEnabled, logoEffect: board.logoEffect ? { ...board.logoEffect } : undefined };
}

export type BoardBrandAction =
  | { type: 'replace'; states: BoardBrandStateMap }
  | { type: 'reconcile-boards'; keys: string[]; defaults: BoardBrandState }
  | { type: 'update-logo'; key: string; logo: LogoGroupState }
  | { type: 'update-cpr'; key: string; cpr: CprState }
  | { type: 'update-logo-visual'; key: string; logoEnabled: boolean; logoEffect: import('../../core').BrandEffectState }
  | { type: 'remove-asset'; assetId: string }
  | { type: 'apply-brand'; keys: string[]; source: BoardBrandState }
  | { type: 'apply-logo-to-scope'; keys: string[]; logo: LogoGroupState }
  | { type: 'apply-cpr-to-scope'; keys: string[]; cpr: CprState }
  | { type: 'apply-logo-visual-to-scope'; keys: string[]; logoEnabled: boolean; logoEffect: import('../../core').BrandEffectState }
  | { type: 'sync-logo-scope'; sourceKey: string; targetKeys: string[]; logo: LogoGroupState; logoEnabled: boolean; logoEffect: import('../../core').BrandEffectState; sourceCanvas: CanvasSize; targetCanvases: Record<string, CanvasSize> }
  | { type: 'sync-cpr-scope'; sourceKey: string; targetKeys: string[]; cpr: CprState; sourceCanvas: CanvasSize; targetCanvases: Record<string, CanvasSize> };

export function boardBrandReducer(state: BoardBrandStateMap, action: BoardBrandAction): BoardBrandStateMap {
  switch (action.type) {
    case 'replace': return action.states;
    case 'reconcile-boards': {
      const requestedKeys = new Set(action.keys);
      const hasSameKeys = Object.keys(state).length === requestedKeys.size && action.keys.every((key) => key in state);
      if (hasSameKeys) return state;
      const next: BoardBrandStateMap = {};
      for (const key of action.keys) {
        // Existing boards retain their object identity. Defaults are cloned once
        // for newly materialized boards so nested offsets/effects never alias.
        next[key] = state[key] ?? cloneBoard(action.defaults);
      }
      return next;
    }
    case 'update-logo': return state[action.key] ? { ...state, [action.key]: { ...state[action.key], logo: action.logo } } : state;
    case 'update-cpr': return state[action.key] ? { ...state, [action.key]: { ...state[action.key], cpr: action.cpr } } : state;
    case 'update-logo-visual': return state[action.key] ? { ...state, [action.key]: { ...state[action.key], logoEnabled: action.logoEnabled, logoEffect: { ...action.logoEffect } } } : state;
    case 'remove-asset': return Object.fromEntries(Object.entries(state).filter(([key]) => !key.startsWith(`${action.assetId}:`)));
    case 'apply-brand': {
      const next = { ...state };
      for (const key of action.keys) if (next[key]) next[key] = cloneBoard(action.source);
      return next;
    }
    case 'apply-logo-to-scope': {
      const next = { ...state };
      for (const key of action.keys) if (next[key]) next[key] = { ...next[key], logo: cloneLogo(action.logo) };
      return next;
    }
    case 'apply-logo-visual-to-scope': {
      const next = { ...state };
      for (const key of action.keys) if (next[key]) next[key] = { ...next[key], logoEnabled: action.logoEnabled, logoEffect: { ...action.logoEffect } };
      return next;
    }
    case 'apply-cpr-to-scope': {
      const next = { ...state };
      for (const key of action.keys) if (next[key]) next[key] = { ...next[key], cpr: cloneCpr(action.cpr) };
      return next;
    }
    case 'sync-logo-scope': {
      const next = { ...state };
      if (next[action.sourceKey]) {
        next[action.sourceKey] = { ...next[action.sourceKey], logo: cloneLogo(action.logo), logoEnabled: action.logoEnabled, logoEffect: { ...action.logoEffect } };
      }
    for (const key of action.targetKeys) {
      if (!next[key]) continue;
      const targetCanvas = action.targetCanvases[key] ?? action.sourceCanvas;
      next[key] = { ...next[key], logo: cloneLogo(normalizeLogoForTarget(action.logo, action.sourceCanvas, targetCanvas)), logoEnabled: action.logoEnabled, logoEffect: { ...action.logoEffect } };
    }
    return next;
  }
  case 'sync-cpr-scope': {
    const next = { ...state };
    if (next[action.sourceKey]) next[action.sourceKey] = { ...next[action.sourceKey], cpr: cloneCpr(action.cpr) };
    for (const key of action.targetKeys) {
      if (!next[key]) continue;
      const targetCanvas = action.targetCanvases[key] ?? action.sourceCanvas;
      next[key] = { ...next[key], cpr: cloneCpr(normalizeCprForTarget(action.cpr, action.sourceCanvas, targetCanvas)) };
    }
      return next;
    }
  }
}
