import type { ReactNode } from 'react';
import { Panel } from './ui';

export function AssetSidebar({ children, ariaLabel = '素材与 Logo 资源' }: { children: ReactNode; ariaLabel?: string }) {
  return <Panel className="asset-panel" aria-label={ariaLabel}>{children}</Panel>;
}
