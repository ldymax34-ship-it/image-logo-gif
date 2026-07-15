export type WorkbenchModule = 'media' | 'custom' | 'gif';

const MODULES: Array<{ id: WorkbenchModule; label: string; glyph: string }> = [
  { id: 'media', label: '设媒', glyph: '▣' },
  { id: 'custom', label: '自定义', glyph: '✦' },
  { id: 'gif', label: 'GIF 压缩', glyph: '◌' }
];

export function ModuleNav({ active, onChange }: { active: WorkbenchModule; onChange: (module: WorkbenchModule) => void }) {
  return <nav className="module-nav" aria-label="工作台模块">
    {MODULES.map((module) => <button key={module.id} type="button" className={active === module.id ? 'active' : ''} onClick={() => onChange(module.id)} aria-current={active === module.id ? 'page' : undefined} title={module.label} aria-label={module.label}>
      <span>{module.glyph}</span>
    </button>)}
  </nav>;
}
