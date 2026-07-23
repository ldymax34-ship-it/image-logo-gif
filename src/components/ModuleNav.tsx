import { type ReactNode } from 'react';

export type WorkbenchModule = 'media' | 'custom';
export type ModuleStatus = 'active' | 'idle' | 'warning' | 'error' | 'disabled';

const MODULES: Array<{ id: WorkbenchModule; label: string; glyph: string }> = [
  { id: 'media', label: '设媒', glyph: '▣' },
  { id: 'custom', label: '自定义', glyph: '✦' }
];

function describeStatus(status: ModuleStatus): string {
  if (status === 'active') return '当前模块';
  if (status === 'idle') return '就绪';
  if (status === 'warning') return '待处理';
  if (status === 'error') return '异常';
  return '未启用';
}

function statusDot(status: ModuleStatus): ReactNode {
  return <span className={`module-status-dot is-${status}`} aria-hidden="true" data-status={status} />;
}

export function ModuleNav({
  active,
  onChange,
  statuses,
  children
}: {
  active: WorkbenchModule;
  onChange: (module: WorkbenchModule) => void;
  statuses: Record<WorkbenchModule, ModuleStatus>;
  children?: ReactNode;
}) {
  return (
    <nav className="module-nav" aria-label="工作台模块">
      {MODULES.map((module) => {
        const isActive = active === module.id;
        const s = statuses[module.id] ?? 'idle';
        return (
          <button
            key={module.id}
            type="button"
            className={`module-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onChange(module.id)}
            aria-current={isActive ? 'page' : undefined}
            title={`${module.label} · ${describeStatus(s)}`}
            aria-label={module.label}
          >
            {statusDot(s)}
            <span className="module-glyph">{module.glyph}</span>
            <span className="module-label">{module.label}</span>
          </button>
        );
      })}
      {children}
    </nav>
  );
}
