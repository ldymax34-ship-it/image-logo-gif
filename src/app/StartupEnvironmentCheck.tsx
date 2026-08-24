import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, ShieldAlert } from 'lucide-react';
import { loadMediaDesktopApi, type MediaDesktopApi } from '../gif-media/mediaDesktop';
import {
  markEnvironmentCheckComplete,
  runEnvironmentCheck,
  type EnvironmentCheckResult,
  type EnvironmentCheckStage,
} from './environmentCheck';

const INITIAL_STAGES: EnvironmentCheckStage[] = [
  { id: 'engine', label: '检测内置转换引擎', status: 'pending' },
  { id: 'encoder', label: '检测视频编码能力', status: 'pending' },
];

function stageIcon(status: EnvironmentCheckStage['status']) {
  if (status === 'done') return <Check size={16} aria-hidden="true" />;
  if (status === 'blocked') return <ShieldAlert size={16} aria-hidden="true" />;
  if (status === 'running') return <LoaderCircle size={16} className="env-check-spin" aria-hidden="true" />;
  return <span className="env-check-dot" aria-hidden="true" />;
}

/**
 * In-app one-time environment check shown before the start page on first launch
 * (or after a settings re-detect). It reuses `media_engine_status` and
 * `watermark_encoder_capability`, shows a few stage states, never opens a new
 * window, and auto-enters the start page when the check passes. Hardware
 * candidates are non-blocking; only true blockers are summarized in-page.
 */
export function StartupEnvironmentCheck({ onComplete }: { onComplete: () => void }) {
  const [stages, setStages] = useState<EnvironmentCheckStage[]>(INITIAL_STAGES);
  const [result, setResult] = useState<EnvironmentCheckResult>();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let disposed = false;
    (async () => {
      let api: MediaDesktopApi;
      try {
        api = await loadMediaDesktopApi();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const outcome: EnvironmentCheckResult = { passed: false, blockers: [`无法加载桌面能力：${message}`] };
        markEnvironmentCheckComplete(false);
        if (!disposed) setResult(outcome);
        return;
      }
      const outcome = await runEnvironmentCheck(api, (stage) => {
        if (disposed) return;
        setStages((previous) => previous.map((item) => (item.id === stage.id ? stage : item)));
      });
      markEnvironmentCheckComplete(outcome.passed);
      if (!disposed) setResult(outcome);
    })();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (result?.passed) {
      const timer = window.setTimeout(() => onCompleteRef.current(), 350);
      return () => window.clearTimeout(timer);
    }
  }, [result]);

  return (
    <main className="env-check" aria-label="正在检测环境配置" aria-busy={!result}>
      <div className="env-check-card">
        <div className="env-check-head">
          <span className="eyebrow">首次启动检测</span>
          <h1>正在检查本机环境</h1>
          <p>确认内置转换引擎与视频编码能力，完成后自动进入工作台。</p>
        </div>
        <ul className="env-check-stages">
          {stages.map((stage) => (
            <li key={stage.id} className={`env-check-stage env-check-stage-${stage.status}`}>
              <span className="env-check-stage-icon">{stageIcon(stage.status)}</span>
              <span className="env-check-stage-copy">
                <strong>{stage.label}</strong>
                {stage.detail ? <small>{stage.detail}</small> : null}
              </span>
            </li>
          ))}
        </ul>
        {result && !result.passed ? (
          <div className="env-check-blockers" role="alert">
            <span className="eyebrow">检测到需要处理的问题</span>
            <ul>{result.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            <button type="button" className="primary-button" onClick={onComplete}>继续使用工作台</button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
