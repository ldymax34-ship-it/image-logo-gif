import type { PointerEvent as ReactPointerEvent } from 'react';

/** Keeps the shared neutral hover light local to the element under the pointer. */
export function trackPointerHighlight(event: ReactPointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
}
