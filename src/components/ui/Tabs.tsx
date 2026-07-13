import type { ReactNode } from 'react';

export type TabItem<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

export function Tabs<T extends string>({ value, items, onChange, ariaLabel }: {
  value: T;
  items: TabItem<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return <div className="segmented-control" role="tablist" aria-label={ariaLabel}>
    {items.map((item) => <button key={item.value} type="button" role="tab" aria-selected={item.value === value} className={item.value === value ? 'active' : ''} disabled={item.disabled} onClick={() => onChange(item.value)}>{item.label}</button>)}
  </div>;
}
