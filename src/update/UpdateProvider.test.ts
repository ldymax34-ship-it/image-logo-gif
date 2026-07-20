import { describe, expect, it, vi } from 'vitest';
import { createUpdateCoordinator } from './UpdateProvider';
import type { UpdateAdapter, UpdateHandle, UpdateState } from './updateTypes';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
function handle(overrides: Partial<UpdateHandle> = {}): UpdateHandle { return { version: '0.1.29', download: vi.fn(async () => {}), install: vi.fn(async () => {}), close: vi.fn(async () => {}), ...overrides }; }
function setup(adapterOverrides: Partial<UpdateAdapter> = {}) {
  const adapter: UpdateAdapter = { isAvailable: () => true, check: vi.fn(async () => null), restart: vi.fn(async () => {}), ...adapterOverrides };
  const states: UpdateState[] = [];
  const coordinator = createUpdateCoordinator({ adapter, getActivity: () => ({ exporting: false, focusEditorOpen: false, focusEditorDirty: false, customWorkbenchDirty: false, settingsDirty: false, settingsDialogOpen: false, confirmationDialogOpen: false }), onState: (state) => states.push(state), appVersion: '0.1.28', platform: 'windows' });
  return { adapter, coordinator, states };
}

describe('updater single-flight coordinator', () => {
  it('shares one check between automatic and manual triggers', async () => {
    const pending = deferred<UpdateHandle | null>();
    const { adapter, coordinator } = setup({ check: vi.fn(() => pending.promise) });
    const automatic = coordinator.checkForUpdate(false);
    const manual = coordinator.checkForUpdate(true);
    expect(adapter.check).toHaveBeenCalledTimes(1);
    pending.resolve(null);
    await Promise.all([automatic, manual]);
  });

  it('reopens the same available update instead of checking again', async () => {
    const update = handle(); const { adapter, coordinator } = setup({ check: vi.fn(async () => update) });
    await coordinator.checkForUpdate(false); coordinator.hideDialog(); await coordinator.checkForUpdate(true);
    expect(adapter.check).toHaveBeenCalledTimes(1);
    expect(coordinator.getState()).toMatchObject({ status: 'available', dialogOpen: true, update });
  });

  it('runs exactly one download for rapid clicks and manual reopening', async () => {
    const pending = deferred<void>(); const update = handle({ download: vi.fn(() => pending.promise) });
    const { coordinator } = setup({ check: vi.fn(async () => update) });
    await coordinator.checkForUpdate(true);
    const first = coordinator.download(); const second = coordinator.download(); const manual = coordinator.checkForUpdate(true);
    expect(update.download).toHaveBeenCalledTimes(1);
    pending.resolve(); await Promise.all([first, second, manual]);
    expect(coordinator.getState().status).toBe('downloaded');
  });

  it('releases a failed handle before one retry creates one new check', async () => {
    const failed = handle({ download: vi.fn(async () => { throw new Error('network timeout'); }) }); const next = handle();
    const { adapter, coordinator } = setup({ check: vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(next) });
    await coordinator.checkForUpdate(true); await coordinator.download();
    await Promise.all([coordinator.retry(), coordinator.retry()]);
    expect(failed.close).toHaveBeenCalledTimes(1);
    expect(adapter.check).toHaveBeenCalledTimes(2);
    expect(coordinator.getState()).toMatchObject({ status: 'available', update: next });
  });

  it('installs and restarts exactly once even when confirmation is clicked repeatedly', async () => {
    const pending = deferred<void>(); const update = handle({ install: vi.fn(() => pending.promise) }); const { adapter, coordinator } = setup({ check: vi.fn(async () => update) });
    await coordinator.checkForUpdate(true); await coordinator.download();
    const first = coordinator.install(); const second = coordinator.install();
    expect(update.install).toHaveBeenCalledTimes(1);
    pending.resolve(); await Promise.all([first, second]);
    expect(adapter.restart).toHaveBeenCalledTimes(1);
  });

  it('does not call install while a gate is blocked', async () => {
    const update = handle(); const { coordinator } = setup({ check: vi.fn(async () => update), });
    await coordinator.checkForUpdate(true); await coordinator.download();
    // Simulate a late state change by constructing a second coordinator with an exporting gate.
    const blocked = createUpdateCoordinator({ adapter: { isAvailable: () => true, check: vi.fn(async () => update), restart: vi.fn(async () => {}) }, getActivity: () => ({ exporting: true, focusEditorOpen: false, focusEditorDirty: false, customWorkbenchDirty: false, settingsDirty: false, settingsDialogOpen: false, confirmationDialogOpen: false }), onState: () => {} });
    await blocked.checkForUpdate(true); await blocked.download(); await blocked.install();
    expect(update.install).not.toHaveBeenCalled();
  });
});
