import { GitBranch, ScrollText } from 'lucide-react';

export const CNB_REPO_URL = '';

export function GlobalTopActions({ onOpenChangelog }: { onOpenChangelog?: () => void }) {
  const repoButton = CNB_REPO_URL ? (
    <a
      className="square-icon-button"
      href={CNB_REPO_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Git 仓库"
      title="Git 仓库"
    >
      <GitBranch size={15} strokeWidth={1.7} aria-hidden="true" />
    </a>
  ) : (
    <button
      type="button"
      className="square-icon-button"
      aria-label="Git 仓库"
      title="Git 仓库（地址待配置）"
      aria-disabled="true"
    >
      <GitBranch size={15} strokeWidth={1.7} aria-hidden="true" />
    </button>
  );

  return (
    <div className="global-top-actions">
      {repoButton}
      {onOpenChangelog ? (
        <button
          type="button"
          className="square-icon-button"
          onClick={onOpenChangelog}
          aria-label="更新日志"
          title="更新日志"
        >
          <ScrollText size={15} strokeWidth={1.7} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
