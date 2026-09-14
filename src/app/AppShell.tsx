import type { ReactNode } from 'react';
import type { WorkbenchModule } from '../components/ModuleNav';

export function AppShell({
  activeModule,
  header,
  children
}: {
  activeModule: WorkbenchModule;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="app-shell">
      <div className="app-shell-header">{header}</div>
      <div className="app-module-shell">
        <div className={`app-module-content app-module-content-${activeModule}`}>
          {children}
        </div>
      </div>
    </main>
  );
}
