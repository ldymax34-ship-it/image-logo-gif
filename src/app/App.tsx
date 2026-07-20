import { useCallback } from 'react';
import { WorkbenchHeader } from '../components';
import { GifCompressorPlaceholder } from '../modules/gif-compressor';
import { CustomWorkbench } from '../modules/custom-workbench/CustomWorkbench';
import { MediaWorkbench } from '../modules/media-workbench/MediaWorkbench';
import { AppRuntimeProvider, useAppRuntime } from './AppRuntimeProvider';
import { AppShell } from './AppShell';
import { GlobalDialogs } from './GlobalDialogs';
import { UpdateDialog, UpdateProvider, useUpdate } from '../update';
import { UncleanExitNotice } from '../diagnostics';

function AppContent() {
  const {
    activeModule,
    requestModuleChange,
    brandAssets,
    brandLayer,
    mediaHeader,
    setSettingsDialogOpen,
    updateActivity
  } = useAppRuntime();
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

  return <>
    <UncleanExitNotice />
    <AppShell
      activeModule={activeModule}
      onModuleChange={requestModuleChange}
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
      {activeModule === 'gif' ? <GifCompressorPlaceholder /> : null}
    </AppShell>
    <GlobalDialogs />
    <UpdateDialog />
  </>;
}

export function App() {
  return <AppRuntimeProvider><UpdateProvider><AppContent /></UpdateProvider></AppRuntimeProvider>;
}
