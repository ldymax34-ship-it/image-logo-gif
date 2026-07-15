export type AppActivity = {
  exporting: boolean;
  focusEditorOpen: boolean;
  focusEditorDirty: boolean;
  settingsDialogOpen: boolean;
  confirmationDialogOpen: boolean;
};

export const IDLE_APP_ACTIVITY: AppActivity = {
  exporting: false,
  focusEditorOpen: false,
  focusEditorDirty: false,
  settingsDialogOpen: false,
  confirmationDialogOpen: false
};
