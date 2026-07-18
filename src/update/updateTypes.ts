export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'install-blocked' | 'installing' | 'error';

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

export type UpdateState = {
  status: UpdateStatus;
  update?: UpdateHandle;
  progress?: DownloadProgress;
  error?: string;
};
