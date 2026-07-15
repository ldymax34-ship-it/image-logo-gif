import { describe, expect, it } from 'vitest';
import { createAppActivity, hasUnsavedActivity } from './appActivity';

describe('AppActivity', () => {
  it('reflects real dirty and exporting overrides', () => {
    const activity = createAppActivity({ exporting: true, focusEditorOpen: true, focusEditorDirty: true, customWorkbenchDirty: true, settingsDirty: true });
    expect(activity).toMatchObject({ exporting: true, focusEditorOpen: true, focusEditorDirty: true, customWorkbenchDirty: true, settingsDirty: true });
    expect(hasUnsavedActivity(activity)).toBe(true);
  });
});
