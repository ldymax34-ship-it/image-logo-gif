import { ScrollText } from 'lucide-react';
import { CnbBrandIcon, GitHubBrandIcon } from '../components/BrandIcons';

export const GITHUB_REPO_URL = 'https://github.com/ldymax34-ship-it/image-logo-gif';
export const CNB_REPO_URL = 'https://cnb.cool/YTT_mgbox/image-logo-gif';

export function GlobalTopActions({ onOpenChangelog }: { onOpenChangelog?: () => void }) {
  return (
    <div className="global-top-actions">
      <a className="square-icon-button brand-link-button" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" aria-label="打开 GitHub 仓库" title="GitHub 仓库">
        <GitHubBrandIcon width={16} height={16} aria-hidden="true" />
      </a>
      <a className="square-icon-button brand-link-button" href={CNB_REPO_URL} target="_blank" rel="noreferrer" aria-label="打开 CNB 仓库" title="CNB 仓库">
        <CnbBrandIcon width={16} height={16} aria-hidden="true" />
      </a>
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
