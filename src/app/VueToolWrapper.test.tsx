// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { VueToolWrapper } from './VueToolWrapper';

vi.mock('../image-tool/main', () => ({ createImageToolApp: () => ({ mount() {}, unmount() {} }) }));
vi.mock('../gif-tool/main', () => ({ createGifToolApp: () => ({ mount() {}, unmount() {} }) }));

it('returns from the image tool directly and keeps the GIF confirmation route', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onReturn = vi.fn();
  await act(async () => { root.render(<VueToolWrapper mountKey="image-compress" onReturn={onReturn} />); });
  act(() => host.querySelector<HTMLButtonElement>('.capsule-back-button')!.click());
  expect(onReturn).toHaveBeenCalledTimes(1);
  const request = vi.fn();
  window.addEventListener('gif-tool-request-return', request);
  await act(async () => { root.render(<VueToolWrapper mountKey="gif-compress" onReturn={onReturn} />); });
  act(() => host.querySelector<HTMLButtonElement>('.capsule-back-button')!.click());
  expect(request).toHaveBeenCalledTimes(1);
  expect(onReturn).toHaveBeenCalledTimes(1);
  window.removeEventListener('gif-tool-request-return', request);
  act(() => root.unmount());
});
