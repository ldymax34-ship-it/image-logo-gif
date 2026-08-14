import { useCallback, useMemo, useState } from 'react';
import type { ModuleStatus, WorkbenchModule } from '../components/ModuleNav';
import { WorkbenchHeader } from '../components';
import { CustomWorkbench } from '../modules/custom-workbench/CustomWorkbench';
import { MediaWorkbench } from '../modules/media-workbench/MediaWorkbench';
import { useMediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import { AppRuntimeProvider, useAppRuntime } from './AppRuntimeProvider';
import { AppShell } from './AppShell';
import { ApplicationSettingsDialog } from './ApplicationSettingsDialog';
import { GlobalDialogs } from './GlobalDialogs';
import { ToolboxHome } from './ToolboxHome';
import { VueToolWrapper } from './VueToolWrapper';
import { BatchTemplateGif } from '../batch-template-gif/BatchTemplateGif';
import { WatermarkWorkbench, type WatermarkWorkbenchMode } from '../watermark-workbench/WatermarkWorkbench';
import '../watermark-workbench/watermarkWorkbench.css';
import '../batch-template-gif/batchTemplateGif.css';
import { UpdateDialog, UpdateProvider, useUpdate } from '../update';
import { UncleanExitNotice } from '../diagnostics';
import type { AppTool } from './AppRuntimeProvider';

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
  const { checkForUpdate } = useUpdate();
  const logoAssets = brandAssets.filter((asset) => asset.type === 'logo');
  const cprAssets = brandAssets.filter((asset) => asset.type === 'cpr');
  const selectedLogo = logoAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const selectedCpr = cprAssets.find((asset) => asset.id === brandLayer.selectedCprId);
  const companyLogo = logoAssets.find((asset) => asset.language === 'custom');
  const gameLogo = selectedLogo?.language !== 'custom' ? selectedLogo : logoAssets.find((asset) => asset.language !== 'custom');
  const sharedState = useMediaWorkbenchState();
  const [watermarkMode, setWatermarkMode] = useState<WatermarkWorkbenchMode>('image');
  const handleCustomWorkbenchDirty = useCallback((customWorkbenchDirty: boolean) => {
    updateActivity({ customWorkbenchDirty });
  }, [updateActivity]);

  const navigateTo = useCallback((tool: AppTool) => {
    setActiveTool(tool);
    setAppPreferences((prev) => prev.lastTool === tool ? prev : { ...prev, lastTool: tool });
  }, [setActiveTool, setAppPreferences]);

  const moduleStatuses = useMemo(
    () => resolveModuleStatuses(activeModule, brandLayer.logoEnabled, brandLayer.cprEnabled),
    [activeModule, brandLayer.logoEnabled, brandLayer.cprEnabled]
  );

  const appSettings = applicationSettingsOpen ? (
    <ApplicationSettingsDialog
      preferences={appPreferences}
      onPreferencesChange={setAppPreferences}
      onClose={() => setApplicationSettingsOpen(false)}
    />
  ) : null;

  return <>
    <UncleanExitNotice />

    {/* Toolbox Home */}
    {activeTool === 'toolbox' && (
      <ToolboxHome
        onOpenLogoLayout={() => navigateTo('logo-layout')}
        onOpenWatermark={() => { setWatermarkMode('image'); navigateTo('watermark'); }}
        onOpenVideoWatermark={() => { setWatermarkMode('video'); navigateTo('watermark'); }}
        onOpenSettings={() => setApplicationSettingsOpen(true)}
      />
    )}

    {/* Logo & Layout (existing) */}
    <div hidden={activeTool !== 'logo-layout'}>
      <AppShell
        activeModule={activeModule}
        onModuleChange={requestModuleChange}
        onReturnToToolbox={requestToolbox}
        moduleStatuses={moduleStatuses}
        header={
          <WorkbenchHeader
            {...mediaHeader}
            onOpenSettings={() => setSettingsDialogOpen(true)}
            onCheckUpdate={() => void checkForUpdate(true)}
          />
        }
      >
        <MediaWorkbench active={activeModule === 'media'} sharedState={sharedState} />
        {activeModule === 'custom' ? (
          <CustomWorkbench
            brandLayer={brandLayer}
            logoAsset={selectedLogo}
            cprAsset={selectedCpr}
            companyLogo={companyLogo}
            gameLogo={gameLogo}
            gameLogos={logoAssets.filter((asset) => asset.language !== 'custom')}
            onDirtyChange={handleCustomWorkbenchDirty}
          />
        ) : null}
      </AppShell>
    </div>

    {/* GIF Compress (embedded Vue) */}
    {activeTool === 'gif-compress' && (
      <VueToolWrapper mountKey="gif-compress" onReturn={requestToolbox} />
    )}

    {/* Batch Template GIF */}
    {activeTool === 'batch-template-gif' && (
      <BatchTemplateGif onReturn={requestToolbox} />
    )}

    {/* Watermark Trace */}
    {activeTool === 'watermark' && (
      <WatermarkWorkbench
        onReturn={requestToolbox}
        sharedState={sharedState}
        initialMode={watermarkMode}
        onModeChange={setWatermarkMode}
      />
    )}

    <GlobalDialogs />
    <UpdateDialog />
    {appSettings}
  </>;
}

export function App() {
  return (
    <AppRuntimeProvider>
      <UpdateProvider>
        <AppContent />
      </UpdateProvider>
    </AppRuntimeProvider>
  );
}
