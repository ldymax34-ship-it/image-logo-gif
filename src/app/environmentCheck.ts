import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import type { MediaDesktopApi } from '../gif-media/mediaDesktop';

/**
 * One-time startup environment check. It reuses the existing
 * `media_engine_status` and `watermark_encoder_capability` commands, runs a
 * few stages in-app (no extra window), and persists a schema-versioned record
 * so the same detection rule version never re-runs on later launches.
 */

export const ENVIRONMENT_CHECK_STORAGE_KEY = 'brand-material-workbench.environment-check.v1';
/** Bump when the detection rules change so the check re-runs once. */
export const ENVIRONMENT_CHECK_RULE_VERSION = 1;

export type EnvironmentCheckStageId = 'engine' | 'encoder';
export type EnvironmentCheckStageStatus = 'pending' | 'running' | 'done' | 'blocked';

export type EnvironmentCheckStage = {
  id: EnvironmentCheckStageId;
  label: string;
  status: EnvironmentCheckStageStatus;
  detail?: string;
};

export type EnvironmentCheckResult = {
  passed: boolean;
  blockers: string[];
};

type EnvironmentCheckRecord = {
  ruleVersion: number;
  checkedAt: number;
  passed: boolean;
};

function readRecord(): EnvironmentCheckRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ENVIRONMENT_CHECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EnvironmentCheckRecord> | null;
    if (!parsed || typeof parsed.ruleVersion !== 'number') return null;
    return {
      ruleVersion: parsed.ruleVersion,
      checkedAt: typeof parsed.checkedAt === 'number' ? parsed.checkedAt : 0,
      passed: parsed.passed !== false,
    };
  } catch {
    return null;
  }
}

export function shouldRunEnvironmentCheck(): boolean {
  if (!isDesktopBridgeAvailable()) return false;
  const record = readRecord();
  if (!record) return true;
  return record.ruleVersion < ENVIRONMENT_CHECK_RULE_VERSION;
}

export function markEnvironmentCheckComplete(passed: boolean): void {
  if (typeof window === 'undefined') return;
  const record: EnvironmentCheckRecord = {
    ruleVersion: ENVIRONMENT_CHECK_RULE_VERSION,
    checkedAt: Date.now(),
    passed,
  };
  window.localStorage.setItem(ENVIRONMENT_CHECK_STORAGE_KEY, JSON.stringify(record));
}

/** Clears the record so a re-check can run on the next mount. */
export function clearEnvironmentCheckRecord(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ENVIRONMENT_CHECK_STORAGE_KEY);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the startup detection stages. Hardware encoder candidates are
 * informational only — a missing hardware candidate is non-blocking as long as
 * the CPU baseline (the engine being ready) passes. Only true blockers (engine
 * not ready, or a capability probe that throws) are collected.
 */
export async function runEnvironmentCheck(
  api: MediaDesktopApi,
  onStage: (stage: EnvironmentCheckStage) => void,
): Promise<EnvironmentCheckResult> {
  const blockers: string[] = [];

  onStage({ id: 'engine', label: '检测内置转换引擎', status: 'running' });
  try {
    const engine = await api.getEngineStatus();
    if (!engine.ready) {
      blockers.push(engine.message || '内置转换引擎不可用');
      onStage({
        id: 'engine',
        label: '检测内置转换引擎',
        status: 'blocked',
        detail: engine.message,
      });
    } else {
      onStage({
        id: 'engine',
        label: '检测内置转换引擎',
        status: 'done',
        detail: engine.ffmpegVersion ? `FFmpeg ${engine.ffmpegVersion}` : undefined,
      });
    }
  } catch (error) {
    const message = errorMessage(error);
    blockers.push(`无法检测内置转换引擎：${message}`);
    onStage({ id: 'engine', label: '检测内置转换引擎', status: 'blocked', detail: message });
  }

  onStage({ id: 'encoder', label: '检测视频编码能力', status: 'running' });
  try {
    const capability = await api.getWatermarkEncoderCapability();
    onStage({
      id: 'encoder',
      label: '检测视频编码能力',
      status: 'done',
      detail: capability.hardwareAvailable
        ? `已启用 ${capability.backendName} 硬件编码`
        : '使用 CPU 兼容编码（可用）',
    });
  } catch (error) {
    const message = errorMessage(error);
    blockers.push(`无法检测视频编码能力：${message}`);
    onStage({ id: 'encoder', label: '检测视频编码能力', status: 'blocked', detail: message });
  }

  return { passed: blockers.length === 0, blockers };
}
