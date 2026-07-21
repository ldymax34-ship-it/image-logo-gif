import type { ReactNode } from 'react';
import type { ModuleStatus, WorkbenchModule } from '../components/ModuleNav';
import { ModuleNav } from '../components/ModuleNav';

export function AppShell({
  activeModule,
  onModuleChange,
  moduleStatuses,
  header,
  children
}: {
  activeModule: WorkbenchModule;
  onModuleChange: (module: WorkbenchModule) => void;
  moduleStatuses: Record<WorkbenchModule, ModuleStatus>;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="app-shell">
      {header}
      <div className="app-module-shell">
        <ModuleNav active={activeModule} onChange={onModuleChange} statuses={moduleStatuses} />
        <div className="app-module-content">
          {children}
        </div>
      </div>
    </main>
  );
}
