// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Select } from './Select';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(props: React.ComponentProps<typeof Select>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Select {...props} />));
  return { container, root };
}

describe('shared Select', () => {
  it('renders an in-app combobox with value, aria label and no visible native select', () => {
    const { container, root } = mount({
      value: 'standard',
      options: [{ value: 'small', label: '小' }, { value: 'standard', label: '标准' }],
      onChange: () => undefined,
      'aria-label': 'Logo 大小'
    });
    const trigger = container.querySelector<HTMLElement>('[role="combobox"]')!;
    expect(trigger.getAttribute('aria-label')).toBe('Logo 大小');
    expect(trigger.textContent).toContain('标准');
    expect(trigger.tagName).toBe('BUTTON');
    expect(container.querySelector('select:not([aria-hidden="true"])')).toBeNull();
    act(() => root.unmount());
  });

  it('opens a portal listbox on click and exposes the selected value', () => {
    const { container, root } = mount({
      value: 'standard',
      options: [{ value: 'small', label: '小' }, { value: 'standard', label: '标准' }],
      onChange: () => undefined,
      'aria-label': 'Logo 大小'
    });
    const trigger = container.querySelector<HTMLElement>('[role="combobox"]')!;
    act(() => { trigger.click(); });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.querySelector('.app-select-content')).not.toBeNull();
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(document.body.querySelector('[role="option"][data-state="checked"]')?.textContent).toContain('标准');
    act(() => root.unmount());
  });

  it('keeps disabled state and aria label on the trigger', () => {
    const { container, root } = mount({
      value: 'standard',
      options: [{ value: 'standard', label: '标准' }],
      disabled: true,
      onChange: () => undefined,
      'aria-label': 'CPR 位置'
    });
    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute('aria-label')).toBe('CPR 位置');
    act(() => root.unmount());
  });

  it('opens and selects by keyboard while preserving onChange semantics', () => {
    const changes: string[] = [];
    const { container, root } = mount({
      value: 'small',
      options: [{ value: 'small', label: '小' }, { value: 'standard', label: '标准' }],
      onChange: (value) => changes.push(value),
      'aria-label': 'Logo 大小'
    });
    const trigger = container.querySelector<HTMLElement>('[role="combobox"]')!;
    act(() => { trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const option = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((item) => item.textContent?.trim() === '标准');
    expect(option).not.toBeNull();
    act(() => option?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(changes).toContain('standard');
    act(() => root.unmount());
  });
});
