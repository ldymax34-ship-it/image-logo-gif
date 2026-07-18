import { describe, expect, it } from 'vitest';
import { createAppActivity } from '../app/appActivity';
import { getInstallBlockReason } from './updateGate';

describe('update install gate', () => {
  it.each([
    ['exporting', createAppActivity({ exporting: true })],
    ['focus open', createAppActivity({ focusEditorOpen: true })],
    ['focus dirty', createAppActivity({ focusEditorDirty: true })],
    ['custom dirty', createAppActivity({ customWorkbenchDirty: true })],
    ['settings dialog open', createAppActivity({ settingsDialogOpen: true })],
    ['settings dirty', createAppActivity({ settingsDirty: true })],
    ['confirmation open', createAppActivity({ confirmationDialogOpen: true })]
  ])('blocks %s', (_name, activity) => expect(getInstallBlockReason(activity)).toBeTruthy());
  it('allows a clean idle app', () => expect(getInstallBlockReason(createAppActivity({}))).toBeUndefined());
});
