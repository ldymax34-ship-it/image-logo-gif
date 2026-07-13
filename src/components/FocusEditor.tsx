import type { ReactNode } from 'react';

export function FocusEditor({ children, onBackdropClose, labelledBy, describedBy }: {
  children: ReactNode;
  onBackdropClose: () => void;
  labelledBy: string;
  describedBy?: string;
}) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onBackdropClose()}>
    <section className="focus-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {children}
    </section>
  </div>;
}
