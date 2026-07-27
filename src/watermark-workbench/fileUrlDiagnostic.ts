export type FileUrlDiagnosticTarget = 'background' | 'watermark-logo';

export type FileUrlDiagnosticStep = {
  at: string;
  stage: string;
  outcome: 'ok' | 'error' | 'info';
  details: Record<string, unknown>;
};

export type FileUrlDiagnosticStrategyKind = 'blob' | 'asset-protocol';

export type FileUrlDiagnosticStrategy = {
  strategy: FileUrlDiagnosticStrategyKind;
  steps: FileUrlDiagnosticStep[];
};

export type FileUrlDiagnosticReport = {
  kind: 'macos-file-url-diagnostic';
  target: FileUrlDiagnosticTarget;
  startedAt: string;
  finishedAt?: string;
  appVersion: string;
  platform: string;
  architecture: string;
  userAgent: string;
  attemptId: string;
  rawPath: string;
  convertedUrl?: string;
  steps: FileUrlDiagnosticStep[];
  strategies: FileUrlDiagnosticStrategy[];
};

type HtmlImageDiagnostic = Record<string, unknown> & { onload: boolean };
type FetchDiagnostic = { status: number; ok: boolean; contentType: string | null; contentLength: string | null };
type BlobUrlApi = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

export type FileUrlDiagnosticOptions = {
  target: FileUrlDiagnosticTarget;
  rawPath: string;
  convertFileSrc: (path: string) => string | Promise<string>;
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  fsProbe: (path: string) => Promise<{ exists: boolean; metadata?: Record<string, unknown> }>;
  fabricProbe: (url: string) => Promise<{ hasObject: boolean; width?: number; height?: number }>;
  /** Injectable only so the diagnostic's own timeouts can be regression tested. */
  htmlImageProbe?: (url: string) => Promise<HtmlImageDiagnostic>;
  /** Injectable only so the diagnostic's own timeouts can be regression tested. */
  fetchProbe?: (url: string) => Promise<FetchDiagnostic>;
  /** Injectable only so the diagnostic's own timeouts can be regression tested. */
  createObjectURL?: (blob: Blob) => string;
  /** Injectable only so the diagnostic's own cleanup can be regression tested. */
  revokeObjectURL?: (url: string) => void;
  appVersion?: string;
  attemptId?: string;
  timeoutMs?: number;
};

function now() { return new Date().toISOString(); }

function createAttemptId() {
  return globalThis.crypto?.randomUUID?.() ?? `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function withTimeout<T>(stage: string, operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${stage} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorDetails(error: unknown) {
  const value = error as { name?: unknown; message?: unknown } | undefined;
  return { name: String(value?.name ?? 'Error'), message: String(value?.message ?? error ?? 'unknown') };
}

function pushStep(strategy: FileUrlDiagnosticStrategy, stage: string, outcome: FileUrlDiagnosticStep['outcome'], details: Record<string, unknown>) {
  strategy.steps.push({ at: now(), stage, outcome, details });
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};

export function mimeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function defaultHtmlImageProbe(url: string): Promise<HtmlImageDiagnostic> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('HTMLImageElement is unavailable in this WebView'));
      return;
    }
    const image = new Image();
    image.onload = () => resolve({
      onload: true,
      currentSrc: image.currentSrc,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    });
    image.onerror = (event) => resolve({
      onload: false,
      eventType: typeof event === 'string' ? event : event.type,
      currentSrc: image.currentSrc,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      note: 'HTMLImageElement.onerror does not expose a browser exception message.',
    });
    image.src = url;
  });
}

async function defaultFetchProbe(url: string): Promise<FetchDiagnostic> {
  if (typeof fetch === 'undefined') throw new Error('fetch is unavailable in this WebView');
  const response = await fetch(url);
  return {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
  };
}

function defaultCreateObjectURL(blob: Blob): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('URL.createObjectURL is unavailable in this WebView');
  }
  return URL.createObjectURL(blob);
}

function defaultRevokeObjectURL(url: string): void {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    throw new Error('URL.revokeObjectURL is unavailable in this WebView');
  }
  URL.revokeObjectURL(url);
}

async function runBlobStrategy({
  rawPath, readFile, htmlImageProbe, fabricProbe, blobUrlApi, timeoutMs,
}: Required<Pick<FileUrlDiagnosticOptions, 'rawPath' | 'readFile' | 'htmlImageProbe' | 'fabricProbe' | 'timeoutMs'>> & { blobUrlApi: BlobUrlApi }): Promise<FileUrlDiagnosticStrategy> {
  const strategy: FileUrlDiagnosticStrategy = { strategy: 'blob', steps: [] };
  let createdBlobUrl: string | undefined;
  try {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await withTimeout('read-file', Promise.resolve().then(() => readFile(rawPath)), timeoutMs);
    } catch (error) {
      pushStep(strategy, 'read-file', 'error', errorDetails(error));
      return strategy;
    }
    pushStep(strategy, 'read-file', 'ok', { byteLength: bytes.byteLength });
    const mime = mimeForPath(rawPath);
    pushStep(strategy, 'mime', 'info', { mime });

    let blobUrl: string;
    try {
      const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const blob = new Blob([blobBytes], { type: mime });
      blobUrl = blobUrlApi.createObjectURL(blob);
      createdBlobUrl = blobUrl;
      pushStep(strategy, 'create-blob-url', 'ok', { scheme: blobUrl.split(':')[0] ?? 'unknown', mime, size: bytes.byteLength });
    } catch (error) {
      pushStep(strategy, 'create-blob-url', 'error', errorDetails(error));
      return strategy;
    }
    try {
      const image = await withTimeout('blob-image', Promise.resolve().then(() => htmlImageProbe(blobUrl)), timeoutMs);
      pushStep(strategy, 'blob-image', image.onload ? 'ok' : 'error', image);
    } catch (error) {
      pushStep(strategy, 'blob-image', 'error', errorDetails(error));
    }
    try {
      const fabric = await withTimeout('blob-fabric', Promise.resolve().then(() => fabricProbe(blobUrl)), timeoutMs);
      pushStep(strategy, 'blob-fabric', fabric.hasObject ? 'ok' : 'error', fabric);
    } catch (error) {
      pushStep(strategy, 'blob-fabric', 'error', errorDetails(error));
    }
  } finally {
    if (createdBlobUrl) {
      try { blobUrlApi.revokeObjectURL(createdBlobUrl); pushStep(strategy, 'revoke', 'info', { revoked: true }); }
      catch (error) { pushStep(strategy, 'revoke', 'error', errorDetails(error)); }
    }
  }
  return strategy;
}

async function runAssetStrategy({
  rawPath, convertFileSrc, htmlImageProbe, fetchProbe, fabricProbe, timeoutMs,
  report,
}: Required<Pick<FileUrlDiagnosticOptions, 'rawPath' | 'convertFileSrc' | 'htmlImageProbe' | 'fetchProbe' | 'fabricProbe' | 'timeoutMs'>> & { report: FileUrlDiagnosticReport }): Promise<FileUrlDiagnosticStrategy> {
  const strategy: FileUrlDiagnosticStrategy = { strategy: 'asset-protocol', steps: [] };
  let url: string;
  try {
    url = await withTimeout('convert-file-src', Promise.resolve().then(() => convertFileSrc(rawPath)), timeoutMs);
    report.convertedUrl = url;
    pushStep(strategy, 'convert-file-src', 'ok', { url });
  } catch (error) {
    pushStep(strategy, 'convert-file-src', 'error', errorDetails(error));
    return strategy;
  }
  try {
    const image = await withTimeout('asset-image', Promise.resolve().then(() => htmlImageProbe(url)), timeoutMs);
    pushStep(strategy, 'asset-image', image.onload ? 'ok' : 'error', image);
  } catch (error) {
    pushStep(strategy, 'asset-image', 'error', errorDetails(error));
  }
  try {
    const response = await withTimeout('asset-fetch', Promise.resolve().then(() => fetchProbe(url)), timeoutMs);
    pushStep(strategy, 'asset-fetch', response.ok ? 'ok' : 'error', response);
  } catch (error) {
    pushStep(strategy, 'asset-fetch', 'error', errorDetails(error));
  }
  try {
    const fabric = await withTimeout('asset-fabric', Promise.resolve().then(() => fabricProbe(url)), timeoutMs);
    pushStep(strategy, 'asset-fabric', fabric.hasObject ? 'ok' : 'error', fabric);
  } catch (error) {
    pushStep(strategy, 'asset-fabric', 'error', errorDetails(error));
  }
  return strategy;
}

export async function runFileUrlDiagnostic({
  target,
  rawPath,
  convertFileSrc,
  readFile,
  fsProbe,
  fabricProbe,
  htmlImageProbe = defaultHtmlImageProbe,
  fetchProbe = defaultFetchProbe,
  createObjectURL = defaultCreateObjectURL,
  revokeObjectURL = defaultRevokeObjectURL,
  appVersion = 'unknown',
  attemptId = createAttemptId(),
  timeoutMs = 10_000,
}: FileUrlDiagnosticOptions): Promise<FileUrlDiagnosticReport> {
  const browser = typeof navigator === 'undefined' ? undefined : navigator;
  const report: FileUrlDiagnosticReport = {
    kind: 'macos-file-url-diagnostic',
    target,
    startedAt: now(),
    rawPath,
    steps: [],
    strategies: [],
    appVersion,
    platform: browser?.platform ?? 'unknown',
    architecture: 'not exposed by WebView',
    userAgent: browser?.userAgent ?? 'unknown',
    attemptId,
  };

  // Shared fs stat probe: visible ACL result for both strategies.
  try {
    const fs = await withTimeout('plugin-fs', Promise.resolve().then(() => fsProbe(rawPath)), timeoutMs);
    report.steps.push({ at: now(), stage: 'plugin-fs', outcome: 'ok', details: fs });
  } catch (error) {
    report.steps.push({ at: now(), stage: 'plugin-fs', outcome: 'error', details: errorDetails(error) });
  }

  const blob = await runBlobStrategy({
    rawPath,
    readFile,
    htmlImageProbe,
    fabricProbe,
    blobUrlApi: { createObjectURL, revokeObjectURL },
    timeoutMs,
  });
  const asset = await runAssetStrategy({ rawPath, convertFileSrc, htmlImageProbe, fetchProbe, fabricProbe, timeoutMs, report });
  report.strategies = [blob, asset];
  report.finishedAt = now();
  return report;
}

export function formatFileUrlDiagnostic(report: FileUrlDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}
