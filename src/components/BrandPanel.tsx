import type { ReactNode } from 'react';

export function BrandPanel({ children }: { children: ReactNode }) {
  return <div className="brand-controls" aria-label="品牌设置">{children}</div>;
}
