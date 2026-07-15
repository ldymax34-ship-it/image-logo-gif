import { getBoardPreviewKey, type BoardBrandState, type BoardBrandStateMap, type BoardPreviewState, type CprState, type LogoGroupState } from '../../core';

export function updateBoardCrop(states: Record<string, BoardPreviewState>, next: BoardPreviewState) { return { ...states, [getBoardPreviewKey(next.assetId, next.specId)]: next }; }
export function updateBoardLogo(states: BoardBrandStateMap, key: string, logo: LogoGroupState) { return states[key] ? { ...states, [key]: { ...states[key], logo } } : states; }
export function updateBoardCpr(states: BoardBrandStateMap, key: string, cpr: CprState) { return states[key] ? { ...states, [key]: { ...states[key], cpr } } : states; }
export function applyBoardBrand(states: BoardBrandStateMap, keys: string[], source: BoardBrandState) { const next = { ...states }; for (const key of keys) if (next[key]) next[key] = { logo: { ...source.logo }, cpr: { ...source.cpr, transform: { ...source.cpr.transform }, effect: { ...source.cpr.effect } } }; return next; }
