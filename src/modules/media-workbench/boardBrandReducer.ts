import type { BoardBrandState, BoardBrandStateMap, CprState, LogoGroupState } from '../../core';

export type BoardBrandAction =
  | { type: 'replace'; states: BoardBrandStateMap }
  | { type: 'update-logo'; key: string; logo: LogoGroupState }
  | { type: 'update-cpr'; key: string; cpr: CprState }
  | { type: 'remove-asset'; assetId: string }
  | { type: 'apply-brand'; keys: string[]; source: BoardBrandState };

export function boardBrandReducer(state: BoardBrandStateMap, action: BoardBrandAction): BoardBrandStateMap {
  switch (action.type) {
    case 'replace': return action.states;
    case 'update-logo': return state[action.key] ? { ...state, [action.key]: { ...state[action.key], logo: action.logo } } : state;
    case 'update-cpr': return state[action.key] ? { ...state, [action.key]: { ...state[action.key], cpr: action.cpr } } : state;
    case 'remove-asset': return Object.fromEntries(Object.entries(state).filter(([key]) => !key.startsWith(`${action.assetId}:`)));
    case 'apply-brand': {
      const next = { ...state };
      for (const key of action.keys) if (next[key]) next[key] = { logo: { ...action.source.logo }, cpr: { ...action.source.cpr, transform: { ...action.source.cpr.transform }, effect: { ...action.source.cpr.effect } } };
      return next;
    }
  }
}
