import type { BoardBrandState, BoardBrandStateMap, CprState, LogoGroupState } from '../../core';

export type BoardBrandAction =
  | { type: 'replace'; states: BoardBrandStateMap }
  | { type: 'reconcile-boards'; keys: string[]; defaults: BoardBrandState }
  | { type: 'update-logo'; key: string; logo: LogoGroupState }
  | { type: 'update-cpr'; key: string; cpr: CprState }
  | { type: 'remove-asset'; assetId: string }
  | { type: 'apply-brand'; keys: string[]; source: BoardBrandState }
  | { type: 'apply-logo-to-same-aspect'; keys: string[]; logo: LogoGroupState }
  | { type: 'apply-cpr-to-same-aspect'; keys: string[]; cpr: CprState }
  | { type: 'apply-logo-to-all'; logo: LogoGroupState }
  | { type: 'apply-cpr-to-all'; cpr: CprState };

export function boardBrandReducer(state: BoardBrandStateMap, action: BoardBrandAction): BoardBrandStateMap {
  switch (action.type) {
    case 'replace': return action.states;
    case 'reconcile-boards': {
      const keys = new Set(action.keys);
      const next: BoardBrandStateMap = {};
      for (const key of action.keys) {
        const current = state[key] ?? action.defaults;
        next[key] = {
          logo: { ...current.logo, manualOffset: current.logo.manualOffset ? { ...current.logo.manualOffset } : undefined },
          cpr: { ...current.cpr, scale: current.cpr.scale ?? 1, transform: { ...current.cpr.transform }, effect: { ...current.cpr.effect } }
        };
      }
      return Object.keys(state).length === keys.size && action.keys.every((key) => state[key] === next[key]) ? state : next;
    }
    case 'update-logo': return state[action.key] ? { ...state, [action.key]: { ...state[action.key], logo: action.logo } } : state;
    case 'update-cpr': return state[action.key] ? { ...state, [action.key]: { ...state[action.key], cpr: action.cpr } } : state;
    case 'remove-asset': return Object.fromEntries(Object.entries(state).filter(([key]) => !key.startsWith(`${action.assetId}:`)));
    case 'apply-brand': {
      const next = { ...state };
      for (const key of action.keys) if (next[key]) next[key] = { logo: { ...action.source.logo }, cpr: { ...action.source.cpr, transform: { ...action.source.cpr.transform }, effect: { ...action.source.cpr.effect } } };
      return next;
    }
    case 'apply-logo-to-same-aspect': {
      const next = { ...state };
      for (const key of action.keys) if (next[key]) next[key] = { ...next[key], logo: { ...action.logo, manualOffset: action.logo.manualOffset ? { ...action.logo.manualOffset } : undefined } };
      return next;
    }
    case 'apply-cpr-to-same-aspect': {
      const next = { ...state };
      for (const key of action.keys) if (next[key]) next[key] = { ...next[key], cpr: { ...action.cpr, scale: action.cpr.scale ?? 1, transform: { ...action.cpr.transform }, effect: { ...action.cpr.effect } } };
      return next;
    }
    case 'apply-logo-to-all': return Object.fromEntries(Object.entries(state).map(([key, board]) => [key, { ...board, logo: { ...action.logo, manualOffset: action.logo.manualOffset ? { ...action.logo.manualOffset } : undefined } }]));
    case 'apply-cpr-to-all': return Object.fromEntries(Object.entries(state).map(([key, board]) => [key, { ...board, cpr: { ...action.cpr, scale: action.cpr.scale ?? 1, transform: { ...action.cpr.transform }, effect: { ...action.cpr.effect } } }]));
  }
}
