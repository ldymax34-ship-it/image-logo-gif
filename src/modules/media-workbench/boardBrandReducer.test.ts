import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup, type BoardBrandState } from '../../core';
import { boardBrandReducer } from './boardBrandReducer';

function defaults(): BoardBrandState { return { logo: createDefaultLogoGroup('zh-CN'), cpr: createDefaultCprState() }; }

describe('boardBrandReducer reconcile-boards', () => {
  it('preserves existing values and does not apply changed defaults over them', () => {
    const current = defaults(); current.logo.placement = 'corner-left';
    const changed = defaults(); changed.logo.placement = 'center';
    const next = boardBrandReducer({ a: current }, { type: 'reconcile-boards', keys: ['a'], defaults: changed });
    expect(next.a.logo.placement).toBe('corner-left');
  });

  it('initializes new boards and removes stale boards', () => {
    const initial = defaults();
    const next = boardBrandReducer({ stale: initial }, { type: 'reconcile-boards', keys: ['new'], defaults: initial });
    expect(Object.keys(next)).toEqual(['new']);
    expect(next.new.logo.gameLogoLanguage).toBe('zh-CN');
  });

  it('does not share nested logo or CPR references', () => {
    const initial = defaults(); initial.logo.manualOffset = { x: 1, y: 2 };
    const next = boardBrandReducer({}, { type: 'reconcile-boards', keys: ['a', 'b'], defaults: initial });
    expect(next.a.logo.manualOffset).not.toBe(next.b.logo.manualOffset);
    expect(next.a.cpr.transform).not.toBe(next.b.cpr.transform);
    expect(next.a.cpr.effect).not.toBe(next.b.cpr.effect);
  });

  it('keeps media board state isolated from unrelated custom state', () => {
    const customState = { dirty: true, offset: { x: 4, y: 5 } };
    boardBrandReducer({}, { type: 'reconcile-boards', keys: ['a'], defaults: defaults() });
    expect(customState).toEqual({ dirty: true, offset: { x: 4, y: 5 } });
  });

  it('applies logo and CPR settings only through explicit scope actions', () => {
    const initial = boardBrandReducer({}, { type: 'reconcile-boards', keys: ['a:wide', 'b:wide', 'a:tall'], defaults: defaults() });
    const nextLogo = { ...createDefaultLogoGroup('zh-CN'), scale: 1.4 };
    const sameAspect = boardBrandReducer(initial, { type: 'apply-logo-to-same-aspect', keys: ['a:wide', 'b:wide'], logo: nextLogo });
    expect(sameAspect['a:wide'].logo.scale).toBe(1.4);
    expect(sameAspect['b:wide'].logo.scale).toBe(1.4);
    expect(sameAspect['a:tall'].logo.scale).toBe(1);

    const nextCpr = { ...createDefaultCprState(), scale: 1.25 };
    const all = boardBrandReducer(sameAspect, { type: 'apply-cpr-to-all', cpr: nextCpr });
    expect(Object.values(all).every((board) => board.cpr.scale === 1.25)).toBe(true);
  });
});
