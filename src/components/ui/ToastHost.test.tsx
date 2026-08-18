// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ToastHost } from './ToastHost';
import { notify } from './toastBus';

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ToastHost />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ToastHost', () => {
  it('renders a titled notification card without changing the toast bus payload', () => {
    act(() => notify('success', '已导出 3 个文件'));

    expect(container.querySelector('.toast-card.is-success')).not.toBeNull();
    expect(container.textContent).toContain('操作完成');
    expect(container.textContent).toContain('已导出 3 个文件');
    expect(container.querySelector('button[aria-label="关闭操作完成通知"]')).not.toBeNull();
  });

  it('can be dismissed only through the explicit close button', () => {
    act(() => notify('error', '磁盘空间不足'));
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭操作失败通知"]')!;

    act(() => close.click());

    expect(container.querySelector('.toast-card')).toBeNull();
  });
});
