import type { ReactNode } from 'react';
import { Panel } from './ui';

export function AssetSidebar({ children }: { children: ReactNode }) {
  return <Panel className="asset-panel" aria-label="素材与 Logo 资源">{children}</Panel>;
}
