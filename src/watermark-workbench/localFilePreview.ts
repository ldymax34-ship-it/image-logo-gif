export type LocalFilePreviewSource = {
  url: string;
  release: () => void;
};

export type LocalFilePreviewDependencies = {
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function localFilePreviewMimeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

async function defaultReadFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  return readFile(path);
}

function defaultCreateObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function defaultRevokeObjectURL(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Creates a short-lived browser URL for a local image path. It deliberately
 * owns no decoding, Fabric state, caching, or export behavior.
 */
export async function createLocalFilePreview(
  path: string,
  dependencies: LocalFilePreviewDependencies = {
    readFile: defaultReadFile,
    createObjectURL: defaultCreateObjectURL,
    revokeObjectURL: defaultRevokeObjectURL,
  },
): Promise<LocalFilePreviewSource> {
  const bytes = await dependencies.readFile(path);
  const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const blob = new Blob([blobBytes], { type: localFilePreviewMimeForPath(path) });
  const url = dependencies.createObjectURL(blob);
  let released = false;

  return {
    url,
    release: () => {
      if (released) return;
      released = true;
      dependencies.revokeObjectURL(url);
    },
  };
}
