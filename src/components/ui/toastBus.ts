export type ToastKind = 'success' | 'error' | 'info';

export type ToastMessage = {
  id: number;
  kind: ToastKind;
  text: string;
};

type ToastListener = (message: ToastMessage) => void;

let nextId = 1;
const listeners = new Set<ToastListener>();
const recentMessages = new Map<string, number>();
const DEDUPE_WINDOW_MS = 2500;

/** Pushes a top-right notification card (success / error / info). */
export function notify(kind: ToastKind, text: string): void {
  if (!text) return;
  const dedupeKey = `${kind}:${text}`;
  const now = Date.now();
  const previousAt = recentMessages.get(dedupeKey);
  if (previousAt !== undefined && now - previousAt < DEDUPE_WINDOW_MS) return;
  recentMessages.set(dedupeKey, now);
  if (recentMessages.size > 40) {
    const oldestKey = recentMessages.keys().next().value;
    if (oldestKey !== undefined) recentMessages.delete(oldestKey);
  }
  const message: ToastMessage = { id: nextId++, kind, text };
  listeners.forEach((listener) => listener(message));
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
