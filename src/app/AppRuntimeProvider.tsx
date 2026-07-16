import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { WorkbenchModule } from '../components/ModuleNav';
import {
  DEFAULT_BRAND_ASSETS,
  DEFAULT_CPR_EFFECT,
  DEFAULT_LOGO_EFFECT,
  loadBrandSettings,
  saveBrandSettings,
  type BrandAsset,
  type BrandLayerState,
  type BrandSettingsV1
} from '../core';
import { AppActivityContext, IDLE_APP_ACTIVITY, type AppActivity } from './appActivity';

export const DEFAULT_BRAND_LAYER: BrandLayerState = {
  logoEnabled: true,
  cprEnabled: true,
  logoLanguage: 'zh-CN',
  cprLanguage: 'zh-CN',
  logoAnchor: 'top-right',
  cprAnchor: 'top-right',
  logoSize: 'standard',
  cprSize: 'standard',
  logoEffect: DEFAULT_LOGO_EFFECT,
  cprEffect: DEFAULT_CPR_EFFECT
};

export type MediaHeaderState = {
  assetCount: number;
  boardCount: number;
  previewCount: number;
  hasPendingSpecChanges: boolean;
};

type AppRuntime = {
  activeModule: WorkbenchModule;
  setActiveModule: Dispatch<SetStateAction<WorkbenchModule>>;
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
  activity: AppActivity;
  updateActivity: (patch: Partial<AppActivity>) => void;
  mediaHeader: MediaHeaderState;
  setMediaHeader: Dispatch<SetStateAction<MediaHeaderState>>;
};

const INITIAL_MEDIA_HEADER: MediaHeaderState = {
  assetCount: 0,
  boardCount: 0,
  previewCount: 0,
  hasPendingSpecChanges: false
};

const AppRuntimeContext = createContext<AppRuntime | undefined>(undefined);

export function AppRuntimeProvider({ children }: { children: ReactNode }) {
  const [activeModule, setActiveModule] = useState<WorkbenchModule>('media');
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>(DEFAULT_BRAND_ASSETS);
  const [brandLayer, setBrandLayer] = useState<BrandLayerState>(DEFAULT_BRAND_LAYER);
  const [brandSettings, setBrandSettings] = useState<BrandSettingsV1>(() => loadBrandSettings());
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [activity, setActivity] = useState<AppActivity>(IDLE_APP_ACTIVITY);
  const [mediaHeader, setMediaHeader] = useState<MediaHeaderState>(INITIAL_MEDIA_HEADER);

  useEffect(() => {
    saveBrandSettings(brandSettings);
  }, [brandSettings]);

  const updateActivity = useCallback((patch: Partial<AppActivity>) => {
    setActivity((previous) => ({ ...previous, ...patch }));
  }, []);

  const value = useMemo<AppRuntime>(() => ({
    activeModule,
    setActiveModule,
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
    activity,
    updateActivity,
    mediaHeader,
    setMediaHeader
  }), [activeModule, brandAssets, brandLayer, brandSettings, settingsDialogOpen, settingsDirty, activity, mediaHeader, updateActivity]);

  return <AppRuntimeContext.Provider value={value}><AppActivityContext.Provider value={activity}>{children}</AppActivityContext.Provider></AppRuntimeContext.Provider>;
}

export function useAppRuntime(): AppRuntime {
  const runtime = useContext(AppRuntimeContext);
  if (!runtime) throw new Error('useAppRuntime must be used within AppRuntimeProvider');
  return runtime;
}
