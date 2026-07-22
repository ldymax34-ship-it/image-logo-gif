import type { ReactNode } from 'react';

export function BrandPanel({ children }: { children: ReactNode }) {
  return <div className="brand-controls" aria-label="Logo 与 CPR 设置">{children}</div>;
}
