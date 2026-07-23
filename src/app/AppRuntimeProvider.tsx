import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { WorkbenchModule } from '../components/ModuleNav';
import {
  DEFAULT_BRAND_ASSETS,
  DEFAULT_BRAND_LAYER,
  DEFAULT_CPR_EFFECT,
  DEFAULT_LOGO_EFFECT,
  loadBrandSettings,
  saveBrandSettings,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1
} from '../core';
import { AppActivityContext, IDLE_APP_ACTIVITY, type AppActivity } from './appActivity';
import { loadAppPreferences, resolveStartupTool, saveAppPreferences, type AppPreferencesV1 } from './appPreferences';

export type AppTool = ReturnType<typeof resolveStartupTool>;
export type AppNavigationTarget = WorkbenchModule | 'toolbox';


export type MediaHeaderState = {
  assetCount: number;
  boardCount: number;
  previewCount: number;
  hasPendingSpecChanges: boolean;
};

type AppRuntime = {
  activeTool: AppTool;
  setActiveTool: (tool: AppTool) => void;
  requestToolbox: () => void;
  appPreferences: AppPreferencesV1;
  setAppPreferences: Dispatch<SetStateAction<AppPreferencesV1>>;
  activeModule: WorkbenchModule;
  setActiveModule: Dispatch<SetStateAction<WorkbenchModule>>;
  requestModuleChange: (module: WorkbenchModule) => void;
  registerMediaModuleChangeGuard: (guard: (target: AppNavigationTarget) => boolean) => () => void;
  brandAssets: BrandAsset[];
  setBrandAssets: Dispatch<SetStateAction<BrandAsset[]>>;
  brandLayer: BrandLayerState;
  setBrandLayer: Dispatch<SetStateAction<BrandLayerState>>;
  brandSettings: BrandSettingsV1;
  setBrandSettings: Dispatch<SetStateAction<BrandSettingsV1>>;
  settingsDialogOpen: boolean;
  setSettingsDialogOpen: Dispatch<SetStateAction<boolean>>;
  settingsDirty: boolean;
  setSettingsDirty: Dispatch<SetStateAction<boolean>>;
  applicationSettingsOpen: boolean;
  setApplicationSettingsOpen: Dispatch<SetStateAction<boolean>>;
  settingsSelectedCompanyLogoId?: string;
  setSettingsSelectedCompanyLogoId: Dispatch<SetStateAction<string | undefined>>;
  activity: AppActivity;
  updateActivity: (patch: Partial<AppActivity>) => void;
  notifyCompanyLogoReplacement: (assetId: string) => void;
  notifyBrandResourceMessage: (message: string) => void;
  registerGlobalBrandResourceHandlers: (handlers: GlobalBrandResourceHandlers) => () => void;
  mediaHeader: MediaHeaderState;
  setMediaHeader: Dispatch<SetStateAction<MediaHeaderState>>;
};

export type GlobalBrandResourceHandlers = {
  onCompanyLogoReplacement?: (assetId: string) => void;
  onMessage?: (message: string) => void;
};

const INITIAL_MEDIA_HEADER: MediaHeaderState = {
  assetCount: 0,
  boardCount: 0,
  previewCount: 0,
  hasPendingSpecChanges: false
};

const AppRuntimeContext = createContext<AppRuntime | undefined>(undefined);

export function resolveAppActivity(
  activity: AppActivity,
  settingsDialogOpen: boolean,
  settingsDirty: boolean
): AppActivity {
  return { ...activity, settingsDialogOpen, settingsDirty };
}

export function AppRuntimeProvider({ children }: { children: ReactNode }) {
  const [appPreferences, setAppPreferences] = useState<AppPreferencesV1>(() => loadAppPreferences());
  const [activeTool, setActiveTool] = useState<AppTool>(() => resolveStartupTool(appPreferences));
  const [activeModule, setActiveModule] = useState<WorkbenchModule>('media');
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>(DEFAULT_BRAND_ASSETS);
  const [brandLayer, setBrandLayer] = useState<BrandLayerState>(DEFAULT_BRAND_LAYER);
  const [brandSettings, setBrandSettings] = useState<BrandSettingsV1>(() => loadBrandSettings());
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [applicationSettingsOpen, setApplicationSettingsOpen] = useState(false);
  const [settingsSelectedCompanyLogoId, setSettingsSelectedCompanyLogoId] = useState<string>();
  const [activity, setActivity] = useState<AppActivity>(IDLE_APP_ACTIVITY);
  const [mediaHeader, setMediaHeader] = useState<MediaHeaderState>(INITIAL_MEDIA_HEADER);
  const globalBrandResourceHandlersRef = useRef<GlobalBrandResourceHandlers>({});
  const mediaModuleChangeGuardRef = useRef<((target: AppNavigationTarget) => boolean) | undefined>();

  useEffect(() => {
    saveBrandSettings(brandSettings);
  }, [brandSettings]);
  useEffect(() => {
    saveAppPreferences(appPreferences);
  }, [appPreferences]);
  useEffect(() => {
    setAppPreferences((previous) => previous.lastTool === activeTool ? previous : { ...previous, lastTool: activeTool });
  }, [activeTool]);

  const requestModuleChange = useCallback((module: WorkbenchModule) => {
    if (module === activeModule) return;
    if (mediaModuleChangeGuardRef.current && !mediaModuleChangeGuardRef.current(module)) return;
    setActiveModule(module);
  }, [activeModule]);
  const requestToolbox = useCallback(() => {
    if (mediaModuleChangeGuardRef.current && !mediaModuleChangeGuardRef.current('toolbox')) return;
    setActiveTool('toolbox');
  }, []);
  const setActiveAppTool = useCallback((tool: AppTool) => {
    setActiveTool(tool);
  }, []);
  const registerMediaModuleChangeGuard = useCallback((guard: (target: AppNavigationTarget) => boolean) => {
    mediaModuleChangeGuardRef.current = guard;
    return () => { if (mediaModuleChangeGuardRef.current === guard) mediaModuleChangeGuardRef.current = undefined; };
  }, []);
  const updateActivity = useCallback((patch: Partial<AppActivity>) => {
    setActivity((previous) => ({ ...previous, ...patch }));
  }, []);
  const registerGlobalBrandResourceHandlers = useCallback((handlers: GlobalBrandResourceHandlers) => {
    globalBrandResourceHandlersRef.current = handlers;
    return () => {
      if (globalBrandResourceHandlersRef.current === handlers) {
        globalBrandResourceHandlersRef.current = {};
      }
    };
  }, []);
  const notifyCompanyLogoReplacement = useCallback((assetId: string) => {
    globalBrandResourceHandlersRef.current.onCompanyLogoReplacement?.(assetId);
  }, []);
  const notifyBrandResourceMessage = useCallback((message: string) => {
    globalBrandResourceHandlersRef.current.onMessage?.(message);
  }, []);
  const resolvedActivity = useMemo(
    () => resolveAppActivity(activity, settingsDialogOpen, settingsDirty),
    [activity, settingsDialogOpen, settingsDirty]
  );

  const value = useMemo<AppRuntime>(() => ({
    activeTool,
    setActiveTool: setActiveAppTool,
    requestToolbox,
    appPreferences,
    setAppPreferences,
    activeModule,
    setActiveModule,
    requestModuleChange,
    registerMediaModuleChangeGuard,
    brandAssets,
    setBrandAssets,
    brandLayer,
    setBrandLayer,
    brandSettings,
    setBrandSettings,
    settingsDialogOpen,
    setSettingsDialogOpen,
    settingsDirty,
    setSettingsDirty,
    applicationSettingsOpen,
    setApplicationSettingsOpen,
    settingsSelectedCompanyLogoId,
    setSettingsSelectedCompanyLogoId,
    activity: resolvedActivity,
    updateActivity,
    notifyCompanyLogoReplacement,
    notifyBrandResourceMessage,
    registerGlobalBrandResourceHandlers,
    mediaHeader,
    setMediaHeader
  }), [activeTool, setActiveAppTool, requestToolbox, appPreferences, activeModule, requestModuleChange, registerMediaModuleChangeGuard, brandAssets, brandLayer, brandSettings, settingsDialogOpen, settingsDirty, applicationSettingsOpen, settingsSelectedCompanyLogoId, resolvedActivity, updateActivity, notifyCompanyLogoReplacement, notifyBrandResourceMessage, registerGlobalBrandResourceHandlers, mediaHeader]);

  return <AppRuntimeContext.Provider value={value}><AppActivityContext.Provider value={resolvedActivity}>{children}</AppActivityContext.Provider></AppRuntimeContext.Provider>;
}

export function useAppRuntime(): AppRuntime {
  const runtime = useContext(AppRuntimeContext);
  if (!runtime) throw new Error('useAppRuntime must be used within AppRuntimeProvider');
  return runtime;
}
