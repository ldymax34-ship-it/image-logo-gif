import type { HTMLAttributes, ReactNode } from 'react';

export function Panel({ className = '', children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section className={`panel ${className}`.trim()} {...props}>{children}</section>;
}
