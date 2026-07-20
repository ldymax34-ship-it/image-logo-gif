export type UpdateStatus = 'idle' | 'scheduled' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'install-blocked' | 'installing' | 'cancelled' | 'error';

export type UpdateInfo = { version: string; date?: string; notes?: string };
export type DownloadProgress = { received: number; total?: number };

export type UpdateHandle = UpdateInfo & {
  download: (onProgress: (progress: DownloadProgress) => void) => Promise<void>;
  install: () => Promise<void>;
  close?: () => Promise<void>;
};

export type UpdateAdapter = {
  isAvailable: () => boolean;
  check: () => Promise<UpdateHandle | null>;
  restart: () => Promise<void>;
};

export type UpdateFailureStage = 'check' | 'manifest' | 'download' | 'signature' | 'install-preparation' | 'install';

/** A local-only, sanitized error record. It is never uploaded automatically. */
export type UpdateDiagnostic = {
  stage: UpdateFailureStage;
  code: string;
  message: string;
  timestamp: string;
  appVersion: string;
  platform: string;
  trigger: 'automatic' | 'manual';
  retryCount: number;
  sanitizedDetails: string;
  retryable: boolean;
};

export type UpdateState = {
  status: UpdateStatus;
  update?: UpdateHandle;
  progress?: DownloadProgress;
  error?: string;
  diagnostic?: UpdateDiagnostic;
  /** Whether the single shared dialog is visible; download work survives hiding it. */
  dialogOpen: boolean;
};
