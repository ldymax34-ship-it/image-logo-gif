import { CircleCheck, CircleSlash, CircleX, Clock, LoaderCircle } from 'lucide-react';

export type ExportTaskStatus = 'queued' | 'exporting' | 'completed' | 'failed' | 'cancelled';

/** Which product flow produced the task. Tasks are scoped by batchId + source. */
export type ExportTaskSource = 'image-watermark' | 'media-batch' | 'custom-export' | 'video-watermark';

export interface ExportTask {
  id: string;
  /** Stable id shared by every task in one export run; the store never mixes batches. */
  batchId: string;
  source: ExportTaskSource;
  name: string;
  extension: string;
  width?: number;
  height?: number;
  size?: string;
  progress: number; // 0..100
  status: ExportTaskStatus;
  error?: string;
  outputPath?: string;
}

export const EXPORT_STATUS_META: Record<ExportTaskStatus, { label: string; tone: ExportTaskStatus }> = {
  queued: { label: '排队中', tone: 'queued' },
  exporting: { label: '导出中', tone: 'exporting' },
  completed: { label: '已完成', tone: 'completed' },
  failed: { label: '失败', tone: 'failed' },
  cancelled: { label: '已取消', tone: 'cancelled' }
};

export function ExportStatus({ status }: { status: ExportTaskStatus }) {
  const meta = EXPORT_STATUS_META[status];
  return <span className={`export-center-task-status is-${meta.tone}`}>{meta.label}</span>;
}

const STATUS_ICONS = {
  queued: Clock,
  exporting: LoaderCircle,
  completed: CircleCheck,
  failed: CircleX,
  cancelled: CircleSlash
} as const;

/** Accessible status icon (lucide only); the loader is a functional progress cue, not decoration. */
export function ExportStatusIcon({ status }: { status: ExportTaskStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className={`export-center-status-icon is-${status}`} aria-hidden="true">
      <Icon size={15} className={status === 'exporting' ? 'export-center-spin' : undefined} />
    </span>
  );
}
