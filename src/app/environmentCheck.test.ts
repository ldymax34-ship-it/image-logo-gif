// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaDesktopApi } from '../gif-media/mediaDesktop';
import {
  clearEnvironmentCheckRecord,
  ENVIRONMENT_CHECK_RULE_VERSION,
  ENVIRONMENT_CHECK_STORAGE_KEY,
  markEnvironmentCheckComplete,
  runEnvironmentCheck,
  shouldRunEnvironmentCheck,
} from './environmentCheck';

const bridge = vi.hoisted(() => ({ available: true }));
vi.mock('../platform/desktopBridge', () => ({
  isDesktopBridgeAvailable: () => bridge.available,
}));

function makeApi(overrides: Partial<MediaDesktopApi> = {}): MediaDesktopApi {
  return {
    getEngineStatus: vi.fn(async () => ({ ready: true, ffmpegVersion: 'n7.0' })),
    getWatermarkEncoderCapability: vi.fn(async () => ({
      hardwareAvailable: false,
      backendName: 'CPU',
      preferred: 'cpu',
    })),
    ...overrides,
  } as unknown as MediaDesktopApi;
}

describe('environment check', () => {
  beforeEach(() => {
    window.localStorage.clear();
    bridge.available = true;
  });

  it('skips the check when the desktop bridge is unavailable', () => {
    bridge.available = false;
    expect(shouldRunEnvironmentCheck()).toBe(false);
  });

  it('runs on first launch and skips the same rule version afterwards', () => {
    expect(shouldRunEnvironmentCheck()).toBe(true);
    markEnvironmentCheckComplete(true);
    expect(shouldRunEnvironmentCheck()).toBe(false);

    // A future rule-version bump re-runs once.
    window.localStorage.setItem(
      ENVIRONMENT_CHECK_STORAGE_KEY,
      JSON.stringify({ ruleVersion: ENVIRONMENT_CHECK_RULE_VERSION - 1, checkedAt: 0, passed: true }),
    );
    expect(shouldRunEnvironmentCheck()).toBe(true);
  });

  it('clears the record for a settings re-detect', () => {
    markEnvironmentCheckComplete(false);
    clearEnvironmentCheckRecord();
    expect(shouldRunEnvironmentCheck()).toBe(true);
  });

  it('passes when the engine is ready even without a hardware encoder', async () => {
    const stages = vi.fn();
    const result = await runEnvironmentCheck(makeApi(), stages);
    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
    const encoderStages = stages.mock.calls.map(([stage]) => stage).filter((stage) => stage.id === 'encoder');
    expect(encoderStages.at(-1)?.status).toBe('done');
  });

  it('reports only true blockers when the engine is not ready', async () => {
    const result = await runEnvironmentCheck(
      makeApi({ getEngineStatus: vi.fn(async () => ({ ready: false, ffmpegVersion: '', message: 'FFmpeg 缺失' })) }),
      vi.fn(),
    );
    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(['FFmpeg 缺失']);
  });
});
