// @vitest-environment jsdom

import { act, createElement, isValidElement, type ChangeEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup, type CprState, type LogoGroupState } from '../../core';
import { CprControls, setCprColorMode } from './CprControls';
import { clampLogoScale, LOGO_SIZE_OPTIONS, LogoGroupControls, parseLogoScalePercent } from './LogoGroupControls';

const COLOR_LABELS = ['原色', '白色', '黑色', '自定义'];

function expectLabelsInOrder(html: string, labels: string[], closingTag: string) {
  let previousIndex = -1;
  for (const label of labels) {
    const index = html.indexOf(`>${label}${closingTag}`, previousIndex + 1);
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

type RangeProps = {
  type?: string;
  children?: ReactNode;
  'aria-label'?: string;
  title?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onDoubleClick?: () => void;
};

function findRangeByLabel(node: ReactNode, label: string): RangeProps {
  if (!isValidElement(node)) throw new Error(`Missing range input: ${label}`);
  const props = node.props as RangeProps;
  if (props.type === 'range' && props['aria-label'] === label) return props;
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) {
    if (child === undefined || child === null || typeof child === 'string' || typeof child === 'number') continue;
    try {
      return findRangeByLabel(child, label);
    } catch {
      // Keep searching sibling branches for the requested control.
    }
  }
  throw new Error(`Missing range input: ${label}`);
}

describe('setCprColorMode', () => {
  it('keeps the stored custom color across white/original/custom mode changes', () => {
    const custom = { ...createDefaultCprState(), colorMode: 'custom' as const, effect: { ...createDefaultCprState().effect, color: '#12abef' } };
    const white = setCprColorMode(custom, 'white');
    const original = setCprColorMode(white, 'original');
    const restored = setCprColorMode(original, 'custom');

    expect(restored.colorMode).toBe('custom');
    expect(restored.effect.color).toBe('#12abef');
  });
});

describe('color mode labels', () => {
  it('renders Logo color modes as 原色、白色、黑色、自定义', () => {
    const html = renderToStaticMarkup(createElement(LogoGroupControls, {
      group: createDefaultLogoGroup(),
      language: 'zh-CN',
      onLanguageChange: () => undefined,
      onChange: () => undefined
    }));
    expect((html.match(/role="combobox"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(html).toContain('aria-label="Logo 配色"');
  });

  it('renders CPR color modes as 原色、白色、黑色、自定义', () => {
    const html = renderToStaticMarkup(createElement(CprControls, {
      state: createDefaultCprState(),
      onChange: () => undefined
    }));
    const segmentStart = html.indexOf('segmented-control compact-segments');
    const segmentEnd = html.indexOf('</div>', segmentStart) + '</div>'.length;
    const colorSegments = html.slice(segmentStart, segmentEnd);

    expect(colorSegments).toContain('cpr-color-mode');
    expectLabelsInOrder(colorSegments, COLOR_LABELS, '</button>');
  });
});

describe('continuous scale reset', () => {
  it('clamps percentage input, keeps empty/NaN input stable, and exposes the larger preset', () => {
    expect(clampLogoScale(12)).toBe(10);
    expect(parseLogoScalePercent('', 2)).toBe(2);
    expect(parseLogoScalePercent('not-a-number', 2)).toBe(2);
    expect(parseLogoScalePercent('250', 1)).toBe(2.5);
    expect(LOGO_SIZE_OPTIONS).toContainEqual({ value: 'xxl', label: '超大（KV）' });
  });

  it('keeps the percentage draft while typing 300, then commits on Enter', () => {
    let group: LogoGroupState = { ...createDefaultLogoGroup(), scale: 1 };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => root.render(createElement(LogoGroupControls, {
      group,
      language: 'zh-CN',
      onLanguageChange: () => undefined,
      onChange: (next) => { group = next; }
    })));

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Logo 连续缩放百分比"]');
    expect(input).not.toBeNull();
    const type = (value: string) => {
      Simulate.change(input!, { target: { value } as unknown as EventTarget });
    };

    act(() => {
      input!.focus();
      type('3');
      type('30');
      type('300');
    });
    expect(input!.value).toBe('300');
    expect(group.scale).toBe(1);

    act(() => input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(input!.value).toBe('300');
    expect(group.scale).toBe(3);

    act(() => root.unmount());
    container.remove();
  });

  it('resets Logo scale through the existing onChange path after a double click', () => {
    let group: LogoGroupState = { ...createDefaultLogoGroup(), scale: 1 };
    const renderControl = () => LogoGroupControls({
      group,
      language: 'zh-CN',
      onLanguageChange: () => undefined,
      onChange: (next) => { group = next; }
    });

    const label = 'Logo 连续缩放，双击恢复 100%';
    const slider = findRangeByLabel(renderControl(), label);
    expect(slider.title).toBe(label);
    slider.onChange?.({ target: { value: '1.37' } } as ChangeEvent<HTMLInputElement>);
    expect(group.scale).toBe(1.37);

    findRangeByLabel(renderControl(), label).onDoubleClick?.();
    expect(group.scale).toBe(1);
  });

  it('resets CPR scale through the existing onChange path after a double click', () => {
    let state: CprState = { ...createDefaultCprState(), scale: 1 };
    const renderControl = () => CprControls({
      state,
      onChange: (next) => { state = next; }
    });

    const label = 'CPR 连续缩放，双击恢复 100%';
    const slider = findRangeByLabel(renderControl(), label);
    expect(slider.title).toBe(label);
    slider.onChange?.({ target: { value: '1.42' } } as ChangeEvent<HTMLInputElement>);
    expect(state.scale).toBe(1.42);

    findRangeByLabel(renderControl(), label).onDoubleClick?.();
    expect(state.scale).toBe(1);
  });
});
