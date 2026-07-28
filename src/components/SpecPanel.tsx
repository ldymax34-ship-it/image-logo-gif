import type { ReactNode } from 'react';
import { Panel } from './ui';

export function SpecPanel({ boardCount, children, title = '尺寸矩阵', countLabel = `${boardCount} 个画板`, ariaLabel = title }: {
  boardCount: number;
  children: ReactNode;
  title?: string;
  countLabel?: string;
  ariaLabel?: string;
}) {
  return <Panel className="spec-panel" aria-label={ariaLabel}>
    <div className="panel-heading"><h2>{title}</h2><span>{countLabel}</span></div>
    {children}
  </Panel>;
}
