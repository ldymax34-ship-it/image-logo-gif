import type { HTMLAttributes, ReactNode } from 'react';

export function Toolbar({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={`toolbar-line ${className}`.trim()} {...props}>{children}</div>;
}
