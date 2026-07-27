/**
 * Fabric's interactive Canvas replaces the supplied canvas element with its
 * own wrapper. Keep that mutable subtree outside React's child reconciliation
 * so unmounting a workspace cannot make React remove the canvas from a stale
 * parent and throw a DOM NotFoundError.
 */
export function createFabricCanvasElement(host: HTMLElement): HTMLCanvasElement {
  const canvas = host.ownerDocument.createElement('canvas');
  host.replaceChildren(canvas);
  return canvas;
}

export function clearFabricCanvasHost(host: HTMLElement): void {
  try {
    host.replaceChildren();
  } catch {
    // React may already have detached the stable host during an unmount.
  }
}

export function ignoreFabricDisposal(disposal: Promise<boolean> | undefined): void {
  void disposal?.catch(() => undefined);
}

/**
 * Let Fabric finish restoring/removing its own mutable canvas subtree before
 * emptying the React-owned host. A later setup gets a newer generation and
 * prevents an older async dispose from clearing its new canvas.
 */
export function disposeFabricCanvasHost(
  host: HTMLElement,
  dispose: (() => Promise<boolean> | boolean | void) | undefined,
  shouldClear: () => boolean
): void {
  let result: Promise<boolean> | boolean | void;
  try {
    result = dispose?.();
  } catch {
    if (shouldClear()) clearFabricCanvasHost(host);
    return;
  }
  void Promise.resolve(result)
    .catch(() => undefined)
    .finally(() => {
      if (shouldClear()) clearFabricCanvasHost(host);
    });
}
