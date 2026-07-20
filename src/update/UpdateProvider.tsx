import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppActivity } from '../app/appActivity';
import { getInstallBlockReason } from './updateGate';
import { createTauriUpdateAdapter } from './updateService';
import type { UpdateAdapter, UpdateHandle, UpdateState } from './updateTypes';

const UpdateContext = createContext<ReturnType<typeof useUpdateController> | undefined>(undefined);

type InstallRunnerOptions = {
  canInstall: () => boolean;
  install: () => Promise<void>;
  restart: () => Promise<void>;
  onInstalling: () => void;
  onError: () => void;
};

/** Keeps a confirmation double-click from invoking install/relaunch twice. */
export function createInstallRunner(options: InstallRunnerOptions) {
  let running = false;
  return async () => {
    if (running || !options.canInstall()) return false;
    running = true;
    options.onInstalling();
    try {
      await options.install();
      await options.restart();
      return true;
    } catch {
      running = false;
      options.onError();
      return false;
    }
  };
}

export function useUpdateController(adapter?: UpdateAdapter) {
  const desktopAdapter = useMemo(() => createTauriUpdateAdapter(), []);
  const resolvedAdapter = adapter ?? desktopAdapter;
  const activity = useAppActivity();
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const activeUpdateRef = useRef<UpdateHandle>();
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const downloadInFlightRef = useRef(false);
  const installRunnerRef = useRef<ReturnType<typeof createInstallRunner>>();
  const lastProgressPaintRef = useRef({ at: 0, received: 0 });

  const clearActiveUpdate = useCallback(() => {
    const previous = activeUpdateRef.current;
    activeUpdateRef.current = undefined;
    void previous?.close?.();
  }, []);

  const checkForUpdate = useCallback(async (manual = false) => {
    if (!resolvedAdapter.isAvailable()) return;
    downloadInFlightRef.current = false;
    installRunnerRef.current = undefined;
    clearActiveUpdate();
    setState({ status: 'checking' });
    try {
      const update = await resolvedAdapter.check();
      activeUpdateRef.current = update ?? undefined;
      setState(update ? { status: 'available', update } : { status: 'idle' });
    } catch {
      setState(manual ? { status: 'error', error: '检查更新失败，请检查网络后重试。', failureStage: 'check' } : { status: 'idle' });
    }
  }, [clearActiveUpdate, resolvedAdapter]);
  const download = useCallback(async () => {
    const update = activeUpdateRef.current ?? state.update;
    if (!update || downloadInFlightRef.current) return;
    downloadInFlightRef.current = true;
    lastProgressPaintRef.current = { at: 0, received: 0 };
    setState({ status: 'downloading', update, progress: { received: 0 } });
    try {
      await update.download((progress) => {
        const now = Date.now();
        const total = progress.total;
        const isFinal = total !== undefined && progress.received >= total;
        if (!isFinal && now - lastProgressPaintRef.current.at < 100) return;
        lastProgressPaintRef.current = { at: now, received: progress.received };
        setState((previous) => ({ ...previous, progress: { ...previous.progress, ...progress } }));
      });
      setState({ status: 'downloaded', update });
    } catch {
      clearActiveUpdate();
      setState({ status: 'error', error: '下载更新失败，请检查网络后重试。', failureStage: 'download' });
    } finally {
      downloadInFlightRef.current = false;
    }
  }, [clearActiveUpdate, state.update]);
  const requestInstall = useCallback(() => {
    if (!state.update) return false;
    const reason = getInstallBlockReason(activityRef.current);
    if (reason) {
      setState({ status: 'install-blocked', update: state.update, error: reason });
      return false;
    }
    return true;
  }, [state.update]);
  const install = useCallback(async () => {
    const update = activeUpdateRef.current ?? state.update;
    if (!update) return;
    if (!installRunnerRef.current) {
      installRunnerRef.current = createInstallRunner({
        canInstall: () => !getInstallBlockReason(activityRef.current),
        install: () => update.install(),
        restart: () => resolvedAdapter.restart(),
        onInstalling: () => setState({ status: 'installing', update }),
        onError: () => setState({ status: 'error', update, error: '安装更新失败，请稍后重试。', failureStage: 'install' })
      });
    }
    await installRunnerRef.current();
  }, [resolvedAdapter, state.update]);
  const dismiss = useCallback(() => {
    downloadInFlightRef.current = false;
    installRunnerRef.current = undefined;
    clearActiveUpdate();
    setState({ status: 'idle' });
  }, [clearActiveUpdate]);
  return { state, enabled: resolvedAdapter.isAvailable(), checkForUpdate, download, requestInstall, install, dismiss };
}

export function UpdateProvider({ children, adapter }: { children: ReactNode; adapter?: UpdateAdapter }) {
  const controller = useUpdateController(adapter);
  useEffect(() => {
    if (!controller.enabled) return;
    const timer = window.setTimeout(() => void controller.checkForUpdate(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [controller.enabled, controller.checkForUpdate]);
  return <UpdateContext.Provider value={controller}>{children}</UpdateContext.Provider>;
}
export function useUpdate() { const value = useContext(UpdateContext); if (!value) throw new Error('UpdateProvider is missing'); return value; }
