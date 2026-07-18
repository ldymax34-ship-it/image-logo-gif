import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppActivity } from '../app/appActivity';
import { getInstallBlockReason } from './updateGate';
import { createTauriUpdateAdapter } from './updateService';
import type { UpdateAdapter, UpdateState } from './updateTypes';

const UpdateContext = createContext<ReturnType<typeof useUpdateController> | undefined>(undefined);

export function useUpdateController(adapter?: UpdateAdapter) {
  const desktopAdapter = useMemo(() => createTauriUpdateAdapter(), []);
  const resolvedAdapter = adapter ?? desktopAdapter;
  const activity = useAppActivity();
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const checkForUpdate = useCallback(async (manual = false) => {
    if (!resolvedAdapter.isAvailable()) return;
    setState({ status: 'checking' });
    try {
      const update = await resolvedAdapter.check();
      setState(update ? { status: 'available', update } : { status: 'idle' });
    } catch {
      setState(manual ? { status: 'error', error: '检查更新失败，请稍后重试。' } : { status: 'idle' });
    }
  }, [resolvedAdapter]);
  const download = useCallback(async () => {
    if (!state.update) return;
    setState({ status: 'downloading', update: state.update, progress: { received: 0 } });
    try {
      await state.update.download((progress) => setState((previous) => ({ ...previous, progress: { ...previous.progress, ...progress } })));
      setState({ status: 'downloaded', update: state.update });
    } catch { setState({ status: 'error', update: state.update, error: '下载更新失败，请重试。' }); }
  }, [state.update]);
  const requestInstall = useCallback(() => {
    if (!state.update) return;
    const reason = getInstallBlockReason(activity);
    setState(reason ? { status: 'install-blocked', update: state.update, error: reason } : { status: 'install-blocked', update: state.update });
  }, [activity, state.update]);
  const install = useCallback(async () => {
    if (!state.update || getInstallBlockReason(activity)) { requestInstall(); return; }
    setState({ status: 'installing', update: state.update });
    try { await state.update.install(); await resolvedAdapter.restart(); } catch { setState({ status: 'error', update: state.update, error: '安装更新失败，请稍后重试。' }); }
  }, [activity, resolvedAdapter, requestInstall, state.update]);
  return { state, enabled: resolvedAdapter.isAvailable(), checkForUpdate, download, requestInstall, install, dismiss: () => setState({ status: 'idle' }) };
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
