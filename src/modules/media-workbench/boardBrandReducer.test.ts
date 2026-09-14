import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup, type BoardBrandState } from '../../core';
import { boardBrandReducer } from './boardBrandReducer';

function defaults(): BoardBrandState { return { logo: createDefaultLogoGroup('zh-CN'), cpr: createDefaultCprState() }; }

describe('boardBrandReducer reconcile-boards', () => {
  it('uses the standard 100% Logo default for new boards without overwriting an existing custom size', () => {
    const custom = { ...createDefaultLogoGroup('zh-CN'), sizePreset: 'xxl' as const, scale: 2.5 };
    const initial = boardBrandReducer({}, { type: 'reconcile-boards', keys: ['old'], defaults: { logo: custom, cpr: createDefaultCprState() } });
    const next = boardBrandReducer(initial, { type: 'reconcile-boards', keys: ['old', 'new'], defaults: { logo: createDefaultLogoGroup('zh-CN'), cpr: createDefaultCprState() } });

    expect(next.old.logo.sizePreset).toBe('xxl');
    expect(next.old.logo.scale).toBe(2.5);
    expect(next.new.logo.sizePreset).toBe('standard');
    expect(next.new.logo.scale).toBe(1);
  });

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
    const sameAspect = boardBrandReducer(initial, { type: 'apply-logo-to-scope', keys: ['a:wide', 'b:wide'], logo: nextLogo });
    expect(sameAspect['a:wide'].logo.scale).toBe(1.4);
    expect(sameAspect['b:wide'].logo.scale).toBe(1.4);
    expect(sameAspect['a:tall'].logo.scale).toBe(1);

    const nextCpr = { ...createDefaultCprState(), scale: 1.25 };
    const all = boardBrandReducer(sameAspect, { type: 'apply-cpr-to-scope', keys: ['a:wide', 'b:wide', 'a:tall'], cpr: nextCpr });
    expect(Object.values(all).every((board) => board.cpr.scale === 1.25)).toBe(true);
  });
});

describe('board logo visual scope', () => {
  it('copies enabled state and Logo effects with the scoped brand state', () => {
    const initial = boardBrandReducer({}, { type: 'reconcile-boards', keys: ['a:s', 'b:s'], defaults: defaults() });
    const effect = { ...initial['a:s'].cpr.effect, glowEnabled: true };
    const visual = boardBrandReducer(initial, { type: 'update-logo-visual', key: 'a:s', logoEnabled: false, logoEffect: effect });
    const scopedVisual = boardBrandReducer(visual, { type: 'apply-logo-visual-to-scope', keys: ['b:s'], logoEnabled: false, logoEffect: effect });
    const applied = boardBrandReducer(scopedVisual, { type: 'apply-brand', keys: ['b:s'], source: visual['a:s'] });
    expect(applied['b:s'].logoEnabled).toBe(false);
    expect(applied['b:s'].logoEffect).toEqual(effect);
    expect(applied['b:s'].logoEffect).not.toBe(effect);
  });
});

describe('board brand scope sync', () => {
  const canvas300 = { width: 300, height: 300 };

  it('sync-logo-scope updates source and targets in one action', () => {
    const initial = boardBrandReducer({}, { type: 'reconcile-boards', keys: ['a:s', 'b:s', 'c:s'], defaults: defaults() });
    const logo = { ...createDefaultLogoGroup('zh-CN'), scale: 1.5, placement: 'corner-left' as const };
    const effect = { ...initial['a:s'].cpr.effect, glowEnabled: true };
    const synced = boardBrandReducer(initial, { type: 'sync-logo-scope', sourceKey: 'a:s', targetKeys: ['b:s'], logo, logoEnabled: false, logoEffect: effect, sourceCanvas: canvas300, targetCanvases: { 'b:s': canvas300 } });
    expect(synced['a:s'].logo.scale).toBe(1.5);
    expect(synced['a:s'].logoEnabled).toBe(false);
    expect(synced['b:s'].logo.scale).toBe(1.5);
    expect(synced['b:s'].logoEnabled).toBe(false);
    expect(synced['c:s'].logo.scale).toBe(1);
  });

  it('sync-cpr-scope updates source and targets in one action', () => {
    const initial = boardBrandReducer({}, { type: 'reconcile-boards', keys: ['a:s', 'b:s'], defaults: defaults() });
    const cpr = { ...createDefaultCprState(), scale: 1.25, transform: { placement: 'bottom-left' as const, offsetX: 0, offsetY: 0 } };
    const synced = boardBrandReducer(initial, { type: 'sync-cpr-scope', sourceKey: 'a:s', targetKeys: ['b:s'], cpr, sourceCanvas: canvas300, targetCanvases: { 'b:s': canvas300 } });
    expect(synced['a:s'].cpr.scale).toBe(1.25);
    expect(synced['b:s'].cpr.scale).toBe(1.25);
  });
});
