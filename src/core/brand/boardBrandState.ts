import type { BoardBrandState, BoardBrandStateMap, CprState, LogoGroupState } from './brandTypes';

export type LegacyBoardBrandStateInput = {
  boardKeys: string[];
  legacyLogoGroups?: Record<string, LogoGroupState>;
  legacyCprStates?: Record<string, CprState>;
  defaults: BoardBrandState;
};

function cloneState(state: BoardBrandState): BoardBrandState {
  return {
    logo: { ...state.logo, manualOffset: state.logo.manualOffset ? { ...state.logo.manualOffset } : undefined },
    cpr: { ...state.cpr, scale: state.cpr.scale ?? 1, transform: { ...state.cpr.transform }, effect: { ...state.cpr.effect } }
  };
}

/** Migrates the temporary split maps into the only writable board brand state. */
export function migrateBoardBrandStates(input: LegacyBoardBrandStateInput): BoardBrandStateMap {
  return Object.fromEntries(input.boardKeys.map((key) => [key, {
    logo: { ...input.defaults.logo, ...(input.legacyLogoGroups?.[key] ?? {}) },
    cpr: input.legacyCprStates?.[key] ? cloneState({ logo: input.defaults.logo, cpr: input.legacyCprStates[key] }).cpr : cloneState(input.defaults).cpr
  }]));
}

export function updateBoardBrandState(map: BoardBrandStateMap, key: string, patch: Partial<BoardBrandState>): BoardBrandStateMap {
  const current = map[key];
  if (!current) return map;
  return { ...map, [key]: { logo: patch.logo ?? current.logo, cpr: patch.cpr ?? current.cpr } };
}
