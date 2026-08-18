import type { ExportTaskStatus } from './ExportStatus';

export function ExportProgress({ value, status }: { value: number; status: ExportTaskStatus }) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      className={`export-center-progress is-${status}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={`export-center-progress-fill is-${status}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
