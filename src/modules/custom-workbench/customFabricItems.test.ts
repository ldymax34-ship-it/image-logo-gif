import { describe, expect, it } from 'vitest';
import { buildBrandRenderPlan, createDefaultLogoGroup } from '../../core';
import { resolveCustomFabricItems, resolveCustomFabricReconcilePlan, type CustomFabricOverlayItem } from './customFabricItems';

const item = (id: CustomFabricOverlayItem['id'], visible = true): CustomFabricOverlayItem => ({
  id,
  rect: { x: 10, y: 20, width: 100, height: 40 },
  visible,
  currentScale: 1,
  minScale: .5,
  maxScale: 3
});

describe('resolveCustomFabricItems', () => {
  it('uses actual Render Plan rects instead of a fixed hitbox and keeps hidden object bounds', () => {
    const gameRect = { x: 423, y: 177, width: 358, height: 108 };
    const companyRect = { x: 1002, y: 248, width: 179, height: 66 };
    const cprRect = { x: 1358, y: 946, width: 412, height: 27 };
    const items = resolveCustomFabricItems({
      gamePlan: { layers: [{ type: 'logo', rect: gameRect }, { type: 'cpr', rect: cprRect }] },
      companyPlan: { layers: [{ type: 'logo', rect: companyRect }] },
      gameEnabled: true,
      companyEnabled: false,
      cprEnabled: true,
      gameScale: 1,
      companyScale: 1.2,
      cprScale: .8,
      logoMaxScale: 3
    });

    expect(items).toEqual([
      expect.objectContaining({ id: 'game', rect: gameRect, visible: true }),
      expect.objectContaining({ id: 'company', rect: companyRect, visible: false }),
      expect.objectContaining({ id: 'cpr', rect: cprRect, visible: true })
    ]);
  });

  it('keeps the game Logo custom transform stable when switching between supported languages', () => {
    const group = { ...createDefaultLogoGroup(), placement: 'custom' as const, constraintMode: 'canvas' as const, manualOffset: { x: 460, y: 216 }, scale: 1.25 };
    const zhPlan = buildBrandRenderPlan(
      { width: 1920, height: 1080 },
      group,
      { gameLogo: { id: 'zh', type: 'logo', sourceKind: 'image', name: 'zh', language: 'zh-CN', sourceUrl: '/zh.png', aspectRatio: 3 } }
    );
    const jaPlan = buildBrandRenderPlan(
      { width: 1920, height: 1080 },
      group,
      { gameLogo: { id: 'ja', type: 'logo', sourceKind: 'image', name: 'ja', language: 'ja-JP', sourceUrl: '/ja.png', aspectRatio: 3 } }
    );

    expect(jaPlan.logoGroupRect).toEqual(zhPlan.logoGroupRect);
  });

  it('creates late-arriving company/CPR objects and updates resource geometry from the latest Render Plan', () => {
    const initial = resolveCustomFabricReconcilePlan([item('game')], [], undefined);
    expect(initial.create.map((candidate) => candidate.id)).toEqual(['game']);

    const company = { ...item('company'), rect: { x: 600, y: 80, width: 180, height: 60 } };
    const cpr = { ...item('cpr'), rect: { x: 1200, y: 900, width: 300, height: 30 } };
    const next = resolveCustomFabricReconcilePlan([item('game'), company, cpr], ['game'], 'game');
    expect(next.create.map((candidate) => candidate.id)).toEqual(['company', 'cpr']);
    expect(next.update).toEqual([item('game')]);

    const replacement = resolveCustomFabricReconcilePlan([{ ...item('game'), rect: { x: 10, y: 20, width: 240, height: 80 } }], ['game'], 'game');
    expect(replacement.update[0]?.rect).toMatchObject({ width: 240, height: 80 });
  });

  it('removes missing resources but keeps hidden objects for later re-display', () => {
    const removed = resolveCustomFabricReconcilePlan([item('game')], ['game', 'company', 'cpr'], 'company');
    expect(removed.remove).toEqual(['company', 'cpr']);
    expect(removed.discardActive).toBe(true);

    const hidden = resolveCustomFabricReconcilePlan([item('game'), item('company', false)], ['game', 'company'], 'company');
    expect(hidden.remove).toEqual([]);
    expect(hidden.update).toEqual([item('game'), item('company', false)]);
    expect(hidden.discardActive).toBe(true);
  });
});
