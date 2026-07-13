import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'default' | 'primary' | 'danger';
};

export function Button({ tone = 'default', className = '', type = 'button', ...props }: ButtonProps) {
  const toneClass = tone === 'primary' ? 'primary-button' : tone === 'danger' ? 'danger-button' : '';
  return <button type={type} className={`${toneClass} ${className}`.trim()} {...props} />;
}
