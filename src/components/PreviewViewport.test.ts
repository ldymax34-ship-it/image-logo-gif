// @vitest-environment jsdom
import { createApp, nextTick } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import PreviewViewport from './PreviewViewport.vue';

afterEach(() => vi.restoreAllMocks());

it('fits, magnifies actual pixels and restores fit without changing the image', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  const host = document.createElement('div');
  const app = createApp(PreviewViewport, { width: 1280, height: 720, label: '对比' });
  app.mount(host);
  await nextTick();
  const content = host.querySelector<HTMLElement>('.preview-viewport-content')!;
  const click = async (text: string) => {
    [...host.querySelectorAll('button')].find(b => b.textContent === text)!.click();
    await nextTick();
  };
  expect(content.style.width).toBe('320px');
  await click('1:1');
  expect(content.style.width).toBe('1280px');
  await click('+');
  expect(content.style.width).toBe('1920px');
  expect(content.style.height).toBe('1080px');
  await click('适应');
  expect(content.style.width).toBe('320px');
  app.unmount();
});

it('pans a magnified image with the pointer and prevents native file dragging', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  const host = document.createElement('div');
  const app = createApp(PreviewViewport, { width: 1280, height: 720, label: 'GIF' });
  app.mount(host);
  await nextTick();
  [...host.querySelectorAll('button')].find(b => b.textContent === '1:1')!.click();
  await nextTick();
  await nextTick();
  const viewport = host.querySelector<HTMLElement>('.preview-viewport-scroll')!;
  const image = document.createElement('img');
  host.querySelector('.preview-viewport-content')!.append(image);
  const left = viewport.scrollLeft;
  const top = viewport.scrollTop;
  const pointer = (type: string, x: number, y: number) => Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }), { pointerId: 7 });
  image.dispatchEvent(pointer('pointerdown', 100, 100));
  viewport.dispatchEvent(pointer('pointermove', 80, 70));
  await nextTick();
  expect(viewport.scrollLeft).toBe(left + 20);
  expect(viewport.scrollTop).toBe(top + 30);
  expect(viewport.classList.contains('is-panning')).toBe(true);
  viewport.dispatchEvent(pointer('pointerup', 80, 70));
  await nextTick();
  viewport.dispatchEvent(pointer('pointermove', 0, 0));
  expect(viewport.scrollLeft).toBe(left + 20);
  expect(viewport.classList.contains('is-panning')).toBe(false);
  const drag = new Event('dragstart', { bubbles: true, cancelable: true });
  image.dispatchEvent(drag);
  expect(drag.defaultPrevented).toBe(true);
  app.unmount();
});
