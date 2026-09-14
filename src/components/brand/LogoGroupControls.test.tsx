// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLogoGroup } from '../../core';
import { LogoGroupControls, getLogoScaleProgress } from './LogoGroupControls';

const mounted: Array<{ container: HTMLDivElement; root: ReturnType<typeof createRoot> }> = [];

afterEach(() => {
  for (const { container, root } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function ControlledLogoGroupControls({ onChange }: { onChange: (next: ReturnType<typeof createDefaultLogoGroup>) => void }) {
  const [group, setGroup] = useState(createDefaultLogoGroup());
  return (
    <LogoGroupControls
      group={group}
      language="zh-CN"
      onLanguageChange={vi.fn()}
      onChange={(next) => { setGroup(next); onChange(next); }}
    />
  );
}

function mount(onChange = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <ControlledLogoGroupControls onChange={onChange} />
  ));
  mounted.push({ container, root });
  return { container, onChange };
}

describe('LogoGroupControls continuous scale', () => {
  it('keeps a standard 100% default and exposes a full-width controlled range', () => {
    const { container } = mount();
    const range = container.querySelector<HTMLInputElement>('input[aria-label="Logo 连续缩放，双击恢复 100%"]')!;

    expect(range.value).toBe('1');
    expect(range.min).toBe('0.1');
    expect(range.max).toBe('10');
    expect(range.step).toBe('0.01');
    expect(range.style.getPropertyValue('--range-progress')).toBe(getLogoScaleProgress(1, 10) + '%');
  });

  it('updates the Logo scale from a drag and keeps the progress fill in sync', () => {
    const { container, onChange } = mount();
    const range = container.querySelector<HTMLInputElement>('input[aria-label="Logo 连续缩放，双击恢复 100%"]')!;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(range, '2.5');
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ scale: 2.5 }));
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Logo 连续缩放，双击恢复 100%"]')?.style.getPropertyValue('--range-progress'))
      .toBe(getLogoScaleProgress(2.5, 10) + '%');
  });
});
