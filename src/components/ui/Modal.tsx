import type { HTMLAttributes, ReactNode } from 'react';

export function Modal({ className = '', children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section className={className} role="dialog" aria-modal="true" {...props}>{children}</section>;
}
