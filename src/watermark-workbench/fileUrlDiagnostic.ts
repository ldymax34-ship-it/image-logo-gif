export type FileUrlDiagnosticTarget = 'background' | 'watermark-logo';

export type FileUrlDiagnosticStep = {
  at: string;
  stage: string;
  outcome: 'ok' | 'error' | 'info';
  details: Record<string, unknown>;
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
};

type HtmlImageDiagnostic = Record<string, unknown> & { onload: boolean };
type FetchDiagnostic = { status: number; ok: boolean; contentType: string | null; contentLength: string | null };

export type FileUrlDiagnosticOptions = {
  target: FileUrlDiagnosticTarget;
  rawPath: string;
  convertFileSrc: (path: string) => string | Promise<string>;
  fsProbe: (path: string) => Promise<{ exists: boolean; metadata?: Record<string, unknown> }>;
  fabricProbe: (url: string) => Promise<{ hasObject: boolean; width?: number; height?: number }>;
  /** Injectable only so the diagnostic's own timeouts can be regression tested. */
  htmlImageProbe?: (url: string) => Promise<HtmlImageDiagnostic>;
  /** Injectable only so the diagnostic's own timeouts can be regression tested. */
  fetchProbe?: (url: string) => Promise<FetchDiagnostic>;
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

function step(report: FileUrlDiagnosticReport, stage: string, outcome: FileUrlDiagnosticStep['outcome'], details: Record<string, unknown>) {
  report.steps.push({ at: now(), stage, outcome, details });
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

export async function runFileUrlDiagnostic({
  target,
  rawPath,
  convertFileSrc,
  fsProbe,
  fabricProbe,
  htmlImageProbe = defaultHtmlImageProbe,
  fetchProbe = defaultFetchProbe,
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
    appVersion,
    platform: browser?.platform ?? 'unknown',
    // WKWebView intentionally does not expose a reliable CPU architecture to page JavaScript.
    architecture: 'not exposed by WebView',
    userAgent: browser?.userAgent ?? 'unknown',
    attemptId,
  };

  step(report, 'dialog-returned-path', 'info', { path: rawPath });
  try {
    const fs = await withTimeout('plugin-fs', Promise.resolve().then(() => fsProbe(rawPath)), timeoutMs);
    step(report, 'plugin-fs', 'ok', fs);
  } catch (error) {
    step(report, 'plugin-fs', 'error', errorDetails(error));
  }

  let url: string;
  try {
    url = await withTimeout('convertFileSrc', Promise.resolve().then(() => convertFileSrc(rawPath)), timeoutMs);
    report.convertedUrl = url;
    step(report, 'convertFileSrc', 'ok', { url });
  } catch (error) {
    step(report, 'convertFileSrc', 'error', errorDetails(error));
    report.finishedAt = now();
    return report;
  }

  try {
    const image = await withTimeout('html-image', Promise.resolve().then(() => htmlImageProbe(url)), timeoutMs);
    step(report, 'html-image', image.onload ? 'ok' : 'error', image);
  } catch (error) {
    step(report, 'html-image', 'error', errorDetails(error));
  }

  try {
    const response = await withTimeout('fetch', Promise.resolve().then(() => fetchProbe(url)), timeoutMs);
    step(report, 'fetch', response.ok ? 'ok' : 'error', response);
  } catch (error) {
    step(report, 'fetch', 'error', errorDetails(error));
  }

  try {
    step(report, 'fabric-from-url-start', 'info', { url });
    const fabric = await withTimeout('fabric-from-url', Promise.resolve().then(() => fabricProbe(url)), timeoutMs);
    step(report, 'fabric-from-url', fabric.hasObject ? 'ok' : 'error', fabric);
  } catch (error) {
    step(report, 'fabric-from-url', 'error', errorDetails(error));
  }

  report.finishedAt = now();
  return report;
}

export function formatFileUrlDiagnostic(report: FileUrlDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}
