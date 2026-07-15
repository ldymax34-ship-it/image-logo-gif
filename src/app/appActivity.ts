export type AppActivity = {
  exporting: boolean;
  focusEditorOpen: boolean;
  focusEditorDirty: boolean;
  customWorkbenchDirty: boolean;
  settingsDialogOpen: boolean;
  settingsDirty: boolean;
  confirmationDialogOpen: boolean;
};

export const IDLE_APP_ACTIVITY: AppActivity = {
  exporting: false,
  focusEditorOpen: false,
  focusEditorDirty: false,
  customWorkbenchDirty: false,
  settingsDialogOpen: false,
  settingsDirty: false,
  confirmationDialogOpen: false
};

export function createAppActivity(activity: Partial<AppActivity>): AppActivity {
  return { ...IDLE_APP_ACTIVITY, ...activity };
}

export function hasUnsavedActivity(activity: AppActivity): boolean {
  return activity.focusEditorDirty || activity.customWorkbenchDirty || activity.settingsDirty;
}
