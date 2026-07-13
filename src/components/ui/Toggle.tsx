import type { InputHTMLAttributes, ReactNode } from 'react';

export function Toggle({ children, ...props }: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) {
  return <label className="toggle"><input type="checkbox" {...props} />{children}</label>;
}
