import type { ReactNode } from 'react';
import { Panel } from './ui';

export function SpecPanel({ boardCount, children }: { boardCount: number; children: ReactNode }) {
  return <Panel className="spec-panel" aria-label="尺寸矩阵">
    <div className="panel-heading"><h2>尺寸矩阵</h2><span>{boardCount} 个画板</span></div>
    {children}
  </Panel>;
}
