export type WorkbenchModule = 'media' | 'custom';

const MODULES: Array<{ id: WorkbenchModule; label: string }> = [
  { id: 'media', label: '设媒' },
  { id: 'custom', label: '自定义' }
];

export function ModuleNav({
  active,
  onChange
}: {
  active: WorkbenchModule;
  onChange: (module: WorkbenchModule) => void;
}) {
  return (
    <nav className="module-nav" aria-label="工作台模块" role="tablist">
      {MODULES.map((module) => {
        const isActive = active === module.id;
        return (
          <button
            key={module.id}
            type="button"
            className={`module-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onChange(module.id)}
            role="tab"
            aria-selected={isActive}
          >
            <span className="module-label">{module.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
