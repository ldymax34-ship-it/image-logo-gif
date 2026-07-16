import { describe, expect, it } from 'vitest';
import { createAppActivity, hasUnsavedActivity } from './appActivity';
import { resolveAppActivity } from './AppRuntimeProvider';

describe('AppActivity', () => {
  it('reflects real dirty and exporting overrides', () => {
    const activity = createAppActivity({ exporting: true, focusEditorOpen: true, focusEditorDirty: true, customWorkbenchDirty: true, settingsDirty: true });
    expect(activity).toMatchObject({ exporting: true, focusEditorOpen: true, focusEditorDirty: true, customWorkbenchDirty: true, settingsDirty: true });
    expect(hasUnsavedActivity(activity)).toBe(true);
  });

  it('keeps global settings activity while merging module activity sources', () => {
    const moduleActivity = createAppActivity({
      exporting: true,
      focusEditorOpen: true,
      focusEditorDirty: true,
      customWorkbenchDirty: true,
      confirmationDialogOpen: true
    });
    const activity = resolveAppActivity(moduleActivity, true, true);

    expect(activity).toMatchObject({
      exporting: true,
      focusEditorOpen: true,
      focusEditorDirty: true,
      customWorkbenchDirty: true,
      settingsDialogOpen: true,
      settingsDirty: true,
      confirmationDialogOpen: true
    });
  });
});
