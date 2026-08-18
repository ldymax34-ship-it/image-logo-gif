import { FolderOpen } from 'lucide-react';
import type { ExportTask } from './ExportStatus';
import { ExportStatus, ExportStatusIcon } from './ExportStatus';
import { ExportProgress } from './ExportProgress';
import { ExportError } from './ExportError';
import { isRevealableOutputPath } from '../../platform/fileSystem';

const SOURCE_LABELS: Record<ExportTask['source'], string> = {
  'image-watermark': '图片水印',
  'media-batch': 'Logo 与版式',
  'custom-export': '自定义画板',
  'video-watermark': '视频水印'
};

export function ExportTaskItem({ task, onReveal }: { task: ExportTask; onReveal?: (path: string) => void }) {
  const dims = task.width != null && task.height != null ? `${task.width}×${task.height}` : null;
  const pct = Math.round(task.progress);
  const revealablePath = isRevealableOutputPath(task.outputPath) ? task.outputPath : undefined;

  return (
    <li className="export-task" data-status={task.status}>
      <ExportStatusIcon status={task.status} />
      <div className="export-task-main">
        <div className="export-task-head">
          <span className="export-task-name" title={task.outputPath ?? task.name}>
            {task.name}.{task.extension}
          </span>
          {task.status === 'completed' && revealablePath ? (
            <button
              type="button"
              className="export-task-reveal"
              aria-label={`在文件夹中显示 ${task.name}.${task.extension}`}
              title={revealablePath}
              onClick={() => onReveal?.(revealablePath)}
            >
              <FolderOpen size={14} aria-hidden="true" />
            </button>
          ) : null}
          <ExportStatus status={task.status} />
        </div>
        <div className="export-task-meta">
          <span>{SOURCE_LABELS[task.source]}</span>
          {dims ? <span>{dims}</span> : null}
          {task.size ? <span>{task.size}</span> : null}
          <span className="export-task-pct">{pct}%</span>
        </div>
        <ExportProgress value={task.progress} status={task.status} />
        <ExportError error={task.error} />
      </div>
    </li>
  );
}
