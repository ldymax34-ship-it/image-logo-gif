import { useCallback, useEffect, useState } from 'react';
import type { WorkbenchModule } from '../components/ModuleNav';
import { WorkbenchHeader } from '../components';
import { CustomWorkbench } from '../modules/custom-workbench/CustomWorkbench';
import { MediaWorkbench } from '../modules/media-workbench/MediaWorkbench';
import { useMediaWorkbenchState } from '../modules/media-workbench/useMediaWorkbenchState';
import { AppRuntimeProvider, useAppRuntime, type AppNavigationTarget, type AppTool } from './AppRuntimeProvider';
import { AppShell } from './AppShell';
import { AppSidebar } from './AppSidebar';
import { ApplicationSettingsDialog } from './ApplicationSettingsDialog';
import { ChangelogDialog } from './ChangelogDialog';
import { ConfirmationDialog } from '../modules/media-workbench/ConfirmationDialog';
import { GlobalDialogs } from './GlobalDialogs';
import { ToolboxHome } from './ToolboxHome';
import { VueToolWrapper } from './VueToolWrapper';
import { BatchTemplateGif } from '../batch-template-gif/BatchTemplateGif';
import { WatermarkWorkbench } from '../watermark-workbench/WatermarkWorkbench';
import { VideoWatermarkWorkspace } from '../watermark-workbench/VideoWatermarkWorkspace';
import '../watermark-workbench/watermarkWorkbench.css';
import '../batch-template-gif/batchTemplateGif.css';
import { UpdateDialog, UpdateProvider, useUpdate } from '../update';
import { UncleanExitNotice } from '../diagnostics';
import { ToastHost } from '../components/ui/ToastHost';
import { ClickSpark } from '../components/ui/ClickSpark';
import { ExportStatusPanel } from '../components/export-status/ExportStatusPanel';
import { AppContentFrame } from './AppContentFrame';
import { clearEnvironmentCheckRecord, shouldRunEnvironmentCheck } from './environmentCheck';

function AppContent() {
  const {
    activeModule,
    activeTool,
    requestToolbox,
    navigateToTool,
    setActiveTool,
    setActiveModule,
    registerNavigationGuard,
    appPreferences,
    setAppPreferences,
    brandAssets,
    brandLayer,
    mediaHeader,
    setSettingsDialogOpen,
    applicationSettingsOpen,
    setApplicationSettingsOpen,
    activity,
    updateActivity,
    recentTools
  } = useAppRuntime();
  const { checkForUpdate } = useUpdate();
  const logoAssets = brandAssets.filter((asset) => asset.type === 'logo');
  const cprAssets = brandAssets.filter((asset) => asset.type === 'cpr');
  const selectedLogo = logoAssets.find((asset) => asset.id === brandLayer.selectedLogoId);
  const selectedCpr = cprAssets.find((asset) => asset.id === brandLayer.selectedCprId);
  const companyLogo = logoAssets.find((asset) => asset.language === 'custom');
  const gameLogo = selectedLogo?.language !== 'custom' ? selectedLogo : logoAssets.find((asset) => asset.language !== 'custom');
  const sharedState = useMediaWorkbenchState();
  const [videoWorkspaceMounted, setVideoWorkspaceMounted] = useState(activeTool === 'video-watermark');
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<AppNavigationTarget>();
  const [customWorkbenchEpoch, setCustomWorkbenchEpoch] = useState(0);
  const [environmentCheckActive, setEnvironmentCheckActive] = useState(() => shouldRunEnvironmentCheck());
  const handleCustomWorkbenchDirty = useCallback((customWorkbenchDirty: boolean) => {
    updateActivity({ customWorkbenchDirty });
  }, [updateActivity]);

  useEffect(() => {
    if (activeTool === 'video-watermark') setVideoWorkspaceMounted(true);
  }, [activeTool]);

  const navigateTo = useCallback((tool: AppTool) => {
    navigateToTool(tool);
  }, [navigateToTool]);

  useEffect(() => {
    const updateRangeFill = (input: HTMLInputElement) => {
      const min = Number(input.min || 0);
      const max = Number(input.max || 100);
      const value = Number(input.value || 0);
      const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
      input.style.setProperty('--range-progress', `${percent}%`);
    };
    const updateAllRanges = () => {
      document.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(updateRangeFill);
    };
    const onInput = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'range') updateRangeFill(target);
    };
    updateAllRanges();
    document.addEventListener('input', onInput, true);
    const observer = new MutationObserver(updateAllRanges);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('input', onInput, true);
      observer.disconnect();
    };
  }, [activeTool]);

  useEffect(() => registerNavigationGuard((target) => {
    if (activeModule !== 'custom' || !activity.customWorkbenchDirty) return true;
    setPendingNavigation(target);
    return false;
  }), [activeModule, activeTool, activity.customWorkbenchDirty, registerNavigationGuard]);

  const requestEnvironmentRecheck = useCallback(() => {
    clearEnvironmentCheckRecord();
    setApplicationSettingsOpen(false);
    setEnvironmentCheckActive(true);
  }, [setApplicationSettingsOpen]);

  function leaveTo(target: AppNavigationTarget) {
    setPendingNavigation(undefined);
    updateActivity({ customWorkbenchDirty: false });
    setCustomWorkbenchEpoch((epoch) => epoch + 1);
    if (target === 'media') {
      setActiveModule('media');
      setActiveTool('logo-layout');
      return;
    }
    if (target === 'custom') {
      setActiveModule('custom');
      setActiveTool('custom');
      return;
    }
    setActiveTool(target);
  }

  const appSettings = applicationSettingsOpen ? (
    <ApplicationSettingsDialog
      preferences={appPreferences}
      onPreferencesChange={setAppPreferences}
      onClose={() => setApplicationSettingsOpen(false)}
      onRecheckEnvironment={requestEnvironmentRecheck}
    />
  ) : null;

  return (
    <AppContentFrame
      environmentCheckActive={environmentCheckActive}
      onEnvironmentCheckComplete={() => setEnvironmentCheckActive(false)}
    >
      <div className="app-layout">
        <AppSidebar
          activeTool={activeTool}
          onNavigate={navigateTo}
          onOpenSettings={() => setApplicationSettingsOpen(true)}
        />
        <main className="app-main">
          <UncleanExitNotice />

          {/* Toolbox Home */}
          {activeTool === 'toolbox' && (
            <ToolboxHome
              onOpenLogoLayout={() => navigateTo('logo-layout')}
              onOpenCustom={() => navigateTo('custom')}
              onOpenWatermark={() => navigateTo('watermark')}
              onOpenVideoWatermark={() => navigateTo('video-watermark')}
              onOpenSettings={() => setApplicationSettingsOpen(true)}
              onOpenChangelog={() => setChangelogOpen(true)}
              recentTools={recentTools}
              onOpenRecentTool={navigateTo}
            />
          )}

          {/* Logo & Layout (existing) and Custom composition share the Logo workbench shell. */}
          <div hidden={activeTool !== 'logo-layout' && activeTool !== 'custom'}>
            <AppShell
              activeModule={activeModule}
              header={
                <WorkbenchHeader
                  {...mediaHeader}
                  title={activeModule === 'custom' ? '自定义构图' : 'Logo 与版式'}
                  description={activeModule === 'custom' ? '自由调整 Logo、CPR 与底图裁切。' : '批量套用 Logo、CPR 与常用画板尺寸。'}
                  onOpenSettings={() => setSettingsDialogOpen(true)}
                  onCheckUpdate={() => void checkForUpdate(true)}
                  onOpenChangelog={() => setChangelogOpen(true)}
                />
              }
            >
              <MediaWorkbench active={activeModule === 'media'} sharedState={sharedState} />
              {activeModule === 'custom' ? (
                <CustomWorkbench
                  key={customWorkbenchEpoch}
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
            <VueToolWrapper mountKey="gif-compress" onReturn={requestToolbox} onOpenChangelog={() => setChangelogOpen(true)} />
          )}

          {/* Batch Template GIF */}
          {activeTool === 'batch-template-gif' && (
            <BatchTemplateGif onReturn={requestToolbox} onOpenChangelog={() => setChangelogOpen(true)} />
          )}

          {/* Image watermark */}
          {activeTool === 'watermark' && (
            <WatermarkWorkbench
              onReturn={requestToolbox}
              sharedState={sharedState}
              onOpenChangelog={() => setChangelogOpen(true)}
            />
          )}

          {/* Video watermark */}
          <div hidden={activeTool !== 'video-watermark'}>
            {videoWorkspaceMounted ? <VideoWatermarkWorkspace onReturn={requestToolbox} onOpenChangelog={() => setChangelogOpen(true)} /> : null}
          </div>

          <GlobalDialogs />
          <UpdateDialog />
          {appSettings}
          {changelogOpen ? <ChangelogDialog onClose={() => setChangelogOpen(false)} /> : null}
          {pendingNavigation ? (
            <ConfirmationDialog
              title="放弃当前自定义构图？"
              message="当前自定义构图尚未导出，切换后画布上的调整会被清空。"
              details={["部分设置仅临时保存在本机，未导出的内容仍可能丢失。"]}
              cancelLabel="继续编辑"
              confirmLabel="放弃并切换"
              destructive
              onCancel={() => setPendingNavigation(undefined)}
              onConfirm={() => leaveTo(pendingNavigation)}
            />
          ) : null}
          <ToastHost />
          <ExportStatusPanel hiddenSources={activeTool === 'video-watermark' ? ['video-watermark'] : undefined} />
        </main>
      </div>
    </AppContentFrame>
  );
}

export function App() {
  return (
    <AppRuntimeProvider>
      <UpdateProvider>
        <ClickSpark>
          <AppContent />
        </ClickSpark>
      </UpdateProvider>
    </AppRuntimeProvider>
  );
}
