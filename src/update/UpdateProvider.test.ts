import { describe, expect, it, vi } from 'vitest';
import { createInstallRunner } from './UpdateProvider';

describe('updater install runner', () => {
  it('installs and restarts exactly once when confirmation is clicked repeatedly', async () => {
    let resolveInstall: () => void = () => {};
    const install = vi.fn(() => new Promise<void>((resolve) => { resolveInstall = resolve; }));
    const restart = vi.fn(async () => {});
    const onInstalling = vi.fn();
    const runner = createInstallRunner({ canInstall: () => true, install, restart, onInstalling, onError: vi.fn() });
    const first = runner();
    const second = runner();
    expect(install).toHaveBeenCalledTimes(1);
    resolveInstall();
    await Promise.all([first, second]);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(onInstalling).toHaveBeenCalledTimes(1);
  });

  it('returns to a retryable state after install failure', async () => {
    const onError = vi.fn();
    const install = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(undefined);
    const runner = createInstallRunner({ canInstall: () => true, install, restart: vi.fn(async () => {}), onInstalling: vi.fn(), onError });
    await expect(runner()).resolves.toBe(false);
    await expect(runner()).resolves.toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(2);
  });

  it('does not install while a gate is blocked', async () => {
    const install = vi.fn(async () => {});
    const runner = createInstallRunner({ canInstall: () => false, install, restart: vi.fn(async () => {}), onInstalling: vi.fn(), onError: vi.fn() });
    await expect(runner()).resolves.toBe(false);
    expect(install).not.toHaveBeenCalled();
  });
});
