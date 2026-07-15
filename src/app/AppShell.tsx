import type { ReactNode } from 'react';
import type { WorkbenchModule } from '../components/ModuleNav';
import { ModuleNav } from '../components/ModuleNav';

export function AppShell({ activeModule, onModuleChange, header, children }: { activeModule: WorkbenchModule; onModuleChange: (module: WorkbenchModule) => void; header: ReactNode; children: ReactNode }) {
  return <main className="app-shell">{header}<div className="app-module-shell"><ModuleNav active={activeModule} onChange={onModuleChange} />{children}</div></main>;
}
