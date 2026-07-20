import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import packageMetadata from '../../package.json';
import { useAppActivity, type AppActivity } from '../app/appActivity';
import { getInstallBlockReason } from './updateGate';
import { createTauriUpdateAdapter } from './updateService';
import type { UpdateAdapter, UpdateDiagnostic, UpdateFailureStage, UpdateHandle, UpdateState } from './updateTypes';

const UpdateContext = createContext<ReturnType<typeof useUpdateController> | undefined>(undefined);

type CoordinatorOptions = {
  adapter: UpdateAdapter;
  getActivity: () => AppActivity;
  onState: (state: UpdateState) => void;
  appVersion?: string;
  platform?: string;
};

function platformLabel() {
  if (typeof navigator === 'undefined') return 'unknown';
  return navigator.userAgent.includes('Windows') ? 'windows' : navigator.userAgent.includes('Mac') ? 'macos' : 'unknown';
}

function sanitizeDetails(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || 'unknown updater error');
  return raw
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/(?:[A-Za-z]:\\|\/Users\/|\/home\/)[^\s]*/g, '[PATH]')
    .replace(/(?:token|password|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 240);
}

function describeFailure(stage: UpdateFailureStage, error: unknown, trigger: 'automatic' | 'manual', retryCount: number, appVersion: string, platform: string): UpdateDiagnostic {
  const details = sanitizeDetails(error).toLowerCase();
  const classifiedStage: UpdateFailureStage = /signature|verify|verification/.test(details) ? 'signature'
    : /json|parse|deserialize|404|not found/.test(details) && stage === 'check' ? 'manifest'
      : stage;
  const code = classifiedStage === 'signature' ? 'signature-verification-failed'
    : classifiedStage === 'manifest' ? /404|not found/.test(details) ? 'manifest-not-found' : 'manifest-invalid'
      : /timeout|network|connect|dns|offline/.test(details) ? 'network-failed'
        : `${classifiedStage}-failed`;
  const labels: Record<UpdateFailureStage, string> = {
    check: '检查更新', manifest: '读取更新清单', download: '下载更新', signature: '签名校验', 'install-preparation': '安装准备', install: '安装更新'
  };
  const reason = code === 'network-failed' ? '网络连接中断或不可达。'
    : code === 'manifest-not-found' ? '更新清单暂时不可用。'
      : code === 'manifest-invalid' ? '更新清单格式无效。'
        : code === 'signature-verification-failed' ? '更新包签名无法验证。'
          : '操作未完成。';
  return { stage: classifiedStage, code, message: `${labels[classifiedStage]}失败：${reason} 当前版本仍可继续使用。`, timestamp: new Date().toISOString(), appVersion, platform, trigger, retryCount, sanitizedDetails: sanitizeDetails(error), retryable: classifiedStage !== 'signature' };
}

/**
 * One state machine owns every check, download and install. It deliberately has no
 * cancellation method: Tauri Updater 2.10 exposes no abort signal for download().
 */
export function createUpdateCoordinator(options: CoordinatorOptions) {
  let state: UpdateState = { status: 'idle', dialogOpen: false };
  let handle: UpdateHandle | undefined;
  let checkPromise: Promise<void> | undefined;
  let downloadPromise: Promise<void> | undefined;
  let installPromise: Promise<boolean> | undefined;
  let retryCount = 0;
  let lastProgressPaint = 0;
  const publish = (next: UpdateState) => { state = next; options.onState(next); };
  const releaseHandle = async () => { const previous = handle; handle = undefined; await previous?.close?.(); };
  const errorState = (stage: UpdateFailureStage, error: unknown, trigger: 'automatic' | 'manual', update?: UpdateHandle) => {
    const diagnostic = describeFailure(stage, error, trigger, retryCount, options.appVersion ?? packageMetadata.version, options.platform ?? platformLabel());
    publish({ status: 'error', dialogOpen: trigger === 'manual' || state.dialogOpen, update, error: diagnostic.message, diagnostic });
  };
  const runCheck = (trigger: 'automatic' | 'manual') => {
    if (!options.adapter.isAvailable()) return Promise.resolve();
    if (checkPromise) { if (trigger === 'manual') publish({ ...state, dialogOpen: true }); return checkPromise; }
    if (state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded' || state.status === 'installing') {
      if (trigger === 'manual') publish({ ...state, dialogOpen: true });
      return Promise.resolve();
    }
    const previousStatus = state.status;
    const task = (async () => {
      if (previousStatus === 'error' || previousStatus === 'cancelled') { retryCount += 1; await releaseHandle(); }
      publish({ status: 'checking', dialogOpen: trigger === 'manual' || state.dialogOpen });
      try {
        const next = await options.adapter.check();
        handle = next ?? undefined;
        publish(next ? { status: 'available', dialogOpen: true, update: next } : { status: 'idle', dialogOpen: trigger === 'manual' });
      } catch (error) {
        if (trigger === 'automatic') publish({ status: 'idle', dialogOpen: false });
        else errorState('check', error, trigger);
      } finally { checkPromise = undefined; }
    })();
    checkPromise = task;
    return task;
  };
  const download = () => {
    if (downloadPromise) { publish({ ...state, dialogOpen: true }); return downloadPromise; }
    const update = handle ?? state.update;
    if (!update) return Promise.resolve();
    lastProgressPaint = 0;
    const task = (async () => {
      publish({ status: 'downloading', dialogOpen: true, update, progress: { received: 0 } });
      try {
        await update.download((progress) => {
          const now = Date.now();
          const final = progress.total !== undefined && progress.received >= progress.total;
          if (!final && now - lastProgressPaint < 100) return;
          lastProgressPaint = now;
          publish({ ...state, status: 'downloading', dialogOpen: state.dialogOpen, update, progress: { ...state.progress, ...progress } });
        });
        publish({ status: 'downloaded', dialogOpen: state.dialogOpen, update });
      } catch (error) {
        await releaseHandle();
        errorState('download', error, 'manual');
      } finally { downloadPromise = undefined; }
    })();
    downloadPromise = task;
    return task;
  };
  const requestInstall = () => {
    const update = handle ?? state.update;
    if (!update) return false;
    const reason = getInstallBlockReason(options.getActivity());
    if (reason) { publish({ status: 'install-blocked', dialogOpen: true, update, error: reason }); return false; }
    return true;
  };
  const install = () => {
    if (installPromise) return installPromise;
    const update = handle ?? state.update;
    if (!update || !requestInstall()) return Promise.resolve(false);
    const task = (async () => {
      publish({ status: 'installing', dialogOpen: true, update });
      try { await update.install(); await options.adapter.restart(); return true; }
      catch (error) { errorState('install', error, 'manual', update); return false; }
      finally { installPromise = undefined; }
    })();
    installPromise = task;
    return task;
  };
  return {
    getState: () => state,
    schedule: () => publish({ ...state, status: state.status === 'idle' ? 'scheduled' : state.status }),
    checkForUpdate: (manual = false) => runCheck(manual ? 'manual' : 'automatic'),
    download,
    requestInstall,
    install,
    hideDialog: () => publish({ ...state, dialogOpen: false }),
    showDialog: () => publish({ ...state, dialogOpen: true }),
    retry: () => runCheck('manual'),
    dispose: () => { void releaseHandle(); }
  };
}

export function useUpdateController(adapter?: UpdateAdapter) {
  const desktopAdapter = useMemo(() => createTauriUpdateAdapter(), []);
  const resolvedAdapter = adapter ?? desktopAdapter;
  const activity = useAppActivity();
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const [state, setState] = useState<UpdateState>({ status: 'idle', dialogOpen: false });
  const coordinatorRef = useRef<ReturnType<typeof createUpdateCoordinator>>();
  if (!coordinatorRef.current) coordinatorRef.current = createUpdateCoordinator({ adapter: resolvedAdapter, getActivity: () => activityRef.current, onState: setState });
  const coordinator = coordinatorRef.current;
  useEffect(() => () => coordinator.dispose(), [coordinator]);
  return { state, enabled: resolvedAdapter.isAvailable(), ...coordinator };
}

export function UpdateProvider({ children, adapter }: { children: ReactNode; adapter?: UpdateAdapter }) {
  const controller = useUpdateController(adapter);
  useEffect(() => {
    if (!controller.enabled) return;
    controller.schedule();
    const timer = window.setTimeout(() => void controller.checkForUpdate(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [controller.enabled, controller.schedule, controller.checkForUpdate]);
  return <UpdateContext.Provider value={controller}>{children}</UpdateContext.Provider>;
}
export function useUpdate() { const value = useContext(UpdateContext); if (!value) throw new Error('UpdateProvider is missing'); return value; }
