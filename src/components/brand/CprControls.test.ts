import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDefaultCprState, createDefaultLogoGroup } from '../../core';
import { CprControls, setCprColorMode } from './CprControls';
import { LogoGroupControls } from './LogoGroupControls';

const COLOR_LABELS = ['原色', '白色', '黑色', '自定义'];

function expectLabelsInOrder(html: string, labels: string[], closingTag: string) {
  let previousIndex = -1;
  for (const label of labels) {
    const index = html.indexOf(`>${label}${closingTag}`, previousIndex + 1);
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
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
    const colorSelectStart = html.indexOf('>配色</label>');
    const colorSelectEnd = html.indexOf('</select>', colorSelectStart) + '</select>'.length;
    const colorSelect = html.slice(colorSelectStart, colorSelectEnd);

    expectLabelsInOrder(colorSelect, COLOR_LABELS, '</option>');
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
