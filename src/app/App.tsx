import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ModuleStatus, WorkbenchModule } from '../components/ModuleNav';
import { WorkbenchHeader } from '../components';
import { CustomWorkbench } from '../modules/custom-workbench/CustomWorkbench';
import { MediaWorkbench } from '../modules/media-workbench/MediaWorkbench';
import { AppRuntimeProvider, useAppRuntime } from './AppRuntimeProvider';
import { AppShell } from './AppShell';
import { ApplicationSettingsDialog } from './ApplicationSettingsDialog';
import { GlobalDialogs } from './GlobalDialogs';
import { ToolboxHome } from './ToolboxHome';
import { openGifMediaPreview } from './gifMediaLauncher';
import { shouldLaunchGifMediaOnStartup } from './appPreferences';
import { UpdateDialog, UpdateProvider, useUpdate } from '../update';
import { UncleanExitNotice } from '../diagnostics';

function resolveModuleStatuses(
  active: WorkbenchModule,
  logoEnabled: boolean,
  cprEnabled: boolean
): Record<WorkbenchModule, ModuleStatus> {
  return {
    media: active === 'media' ? 'active' : (logoEnabled ? 'idle' : 'idle'),
    custom: active === 'custom' ? 'active' : (logoEnabled ? 'idle' : 'disabled')
  };
}

function AppContent() {
  const {
    activeModule,
    activeTool,
    requestModuleChange,
    requestToolbox,
    setActiveTool,
    appPreferences,
    setAppPreferences,
    brandAssets,
    brandLayer,
    mediaHeader,
    setSettingsDialogOpen,
    applicationSettingsOpen,
    setApplicationSettingsOpen,
    updateActivity
  } = useAppRuntime();
  const startupMediaHandled = useRef(false);
  const { checkForUpdate } = useUpdate();
  const logoAssets = brandAssets.filter((asset) => asset.type === 'logo');
  const cprAssets = brandAssets.filter((asset) => asset.type === 'cpr');
  const selectedLogo = logoAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const selectedCpr = cprAssets.find((asset) => asset.id === brandLayer.selectedCprId);
  const companyLogo = logoAssets.find((asset) => asset.language === 'custom');
  const gameLogo = selectedLogo?.language !== 'custom' ? selectedLogo : logoAssets.find((asset) => asset.language !== 'custom');
  const handleCustomWorkbenchDirty = useCallback((customWorkbenchDirty: boolean) => {
    updateActivity({ customWorkbenchDirty });
  }, [updateActivity]);

  // Open GIF tool (separate window)
  const openGifTool = useCallback(() => {
    setAppPreferences((previous) => previous.lastTool === 'gif-media' ? previous : { ...previous, lastTool: 'gif-media' });
    void openGifMediaPreview({ mode: 'gif' });
  }, [setAppPreferences]);

  // Open watermark tool (separate window)
  const openWatermarkTool = useCallback(() => {
    setAppPreferences((previous) => previous.lastTool === 'watermark-trace' ? previous : { ...previous, lastTool: 'watermark-trace' });
    void openGifMediaPreview({ mode: 'watermark' });
  }, [setAppPreferences]);

  useEffect(() => {
    if (startupMediaHandled.current || !shouldLaunchGifMediaOnStartup(appPreferences)) return;
    startupMediaHandled.current = true;
    void openGifMediaPreview();
  }, [appPreferences]);

  const moduleStatuses = useMemo(
    () => resolveModuleStatuses(activeModule, brandLayer.logoEnabled, brandLayer.cprEnabled),
    [activeModule, brandLayer.logoEnabled, brandLayer.cprEnabled]
  );

  const appSettings = applicationSettingsOpen ? <ApplicationSettingsDialog preferences={appPreferences} onPreferencesChange={setAppPreferences} onClose={() => setApplicationSettingsOpen(false)} /> : null;

  return <>
    <UncleanExitNotice />
    {activeTool === 'toolbox' ? <ToolboxHome onOpenLogoLayout={() => setActiveTool('logo-layout')} onOpenGifTool={openGifTool} onOpenWatermarkTool={openWatermarkTool} onOpenSettings={() => setApplicationSettingsOpen(true)} /> : null}
    <div hidden={activeTool !== 'logo-layout'}>
      <AppShell
        activeModule={activeModule}
        onModuleChange={requestModuleChange}
        onReturnToToolbox={requestToolbox}
        moduleStatuses={moduleStatuses}
        header={<WorkbenchHeader {...mediaHeader} onOpenSettings={() => setSettingsDialogOpen(true)} onCheckUpdate={() => void checkForUpdate(true)} />}
      >
        <MediaWorkbench active={activeModule === 'media'} />
        {activeModule === 'custom' ? <CustomWorkbench
          brandLayer={brandLayer}
          logoAsset={selectedLogo}
          cprAsset={selectedCpr}
          companyLogo={companyLogo}
          gameLogo={gameLogo}
          gameLogos={logoAssets.filter((asset) => asset.language !== 'custom')}
          onDirtyChange={handleCustomWorkbenchDirty}
        /> : null}
      </AppShell>
    </div>
    <GlobalDialogs />
    <UpdateDialog />
    {appSettings}
  </>;
}

export function App() {
  return <AppRuntimeProvider><UpdateProvider><AppContent /></UpdateProvider></AppRuntimeProvider>;
}
