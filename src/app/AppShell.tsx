import type { ReactNode } from 'react';
import type { ModuleStatus, WorkbenchModule } from '../components/ModuleNav';
import { ModuleNav } from '../components/ModuleNav';

export function AppShell({
  activeModule,
  onModuleChange,
  onReturnToToolbox,
  moduleStatuses,
  header,
  children
}: {
  activeModule: WorkbenchModule;
  onModuleChange: (module: WorkbenchModule) => void;
  onReturnToToolbox: () => void;
  moduleStatuses: Record<WorkbenchModule, ModuleStatus>;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="app-shell">
      <div className="app-shell-header">
        <button type="button" className="return-toolbox-button" onClick={onReturnToToolbox} title="返回品宣工具箱">返回工具箱</button>
        {header}
      </div>
      <div className="app-module-shell">
        <ModuleNav active={activeModule} onChange={onModuleChange} statuses={moduleStatuses} />
        <div className="app-module-content">
          {children}
        </div>
      </div>
    </main>
  );
}
