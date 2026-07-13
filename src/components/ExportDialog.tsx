import type { ReactNode } from 'react';

export function ExportDialog({ children, onClose, locked }: { children: ReactNode; onClose: () => void; locked?: boolean }) {
  return <div className="dialog-backdrop export-backdrop" role="presentation" onMouseDown={(event) => !locked && event.target === event.currentTarget && onClose()}>
    <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
      {children}
    </section>
  </div>;
}
