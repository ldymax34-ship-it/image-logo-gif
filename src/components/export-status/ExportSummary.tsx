import { useMemo } from 'react';
import type { ExportTask } from './ExportStatus';

type StatProps = {
  label: string;
  value: number;
  tone: 'total' | 'exporting' | 'completed' | 'failed';
};

export function ExportSummary({ tasks }: { tasks: ExportTask[] }) {
  const counts = useMemo(() => {
    const c = { total: tasks.length, exporting: 0, completed: 0, failed: 0 };
    for (const task of tasks) {
      if (task.status === 'exporting' || task.status === 'queued') c.exporting += 1;
      else if (task.status === 'completed') c.completed += 1;
      else if (task.status === 'failed') c.failed += 1;
    }
    return c;
  }, [tasks]);

  return (
    <div className="export-summary" aria-label="导出统计">
      <SummaryStat label="总数" value={counts.total} tone="total" />
      <SummaryStat label="处理中" value={counts.exporting} tone="exporting" />
      <SummaryStat label="已完成" value={counts.completed} tone="completed" />
      <SummaryStat label="失败" value={counts.failed} tone="failed" />
    </div>
  );
}

function SummaryStat({ label, value, tone }: StatProps) {
  return (
    <div className={`export-summary-stat is-${tone}`}>
      <span className="export-summary-label">{label}</span>
      <span className="export-summary-value">{value}</span>
    </div>
  );
}
