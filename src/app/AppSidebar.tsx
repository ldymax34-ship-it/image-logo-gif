import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  LayoutGrid,
  Palette,
  Settings,
  ShieldCheck,
  type LucideIcon
} from 'lucide-react';
import packageMetadata from '../../package.json';
import type { AppTool } from './AppRuntimeProvider';

type SidebarTool = {
  id: AppTool;
  label: string;
  icon: LucideIcon;
  group: 'home' | 'production';
};

const SIDEBAR_TOOLS: SidebarTool[] = [
  { id: 'toolbox', label: '工具箱首页', icon: LayoutGrid, group: 'home' },
  { id: 'logo-layout', label: 'Logo 与版式', icon: Palette, group: 'production' },
  { id: 'watermark', label: '图片水印', icon: ShieldCheck, group: 'production' },
  { id: 'video-watermark', label: '视频水印', icon: Film, group: 'production' }
];

const GROUP_LABELS: Record<SidebarTool['group'], string> = {
  home: '',
  production: '生产工具'
};

const SIDEBAR_COLLAPSED_KEY = 'brand-material-workbench.sidebar-collapsed.v1';

function loadSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) !== 'false';
}

export function AppSidebar({
  activeTool,
  onNavigate,
  onOpenSettings
}: {
  activeTool: AppTool;
  onNavigate: (tool: AppTool) => void;
  onOpenSettings: () => void;
}) {
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
  let lastGroup = '';

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      }
      return next;
    });
  }

  return (
    <aside className={`app-sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="主导航">
      <div className="app-sidebar-brand">
        {collapsed ? (
          <button
            type="button"
            className="app-sidebar-collapse app-sidebar-expand"
            onClick={toggleCollapsed}
            aria-label="展开侧边栏"
            title="展开侧边栏"
          >
            <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        ) : (
          <>
            <span className="app-sidebar-brand-mark" aria-hidden="true">
              <Palette size={15} strokeWidth={1.6} />
            </span>
            <div className="app-sidebar-brand-copy">
              <strong>品宣工具箱</strong>
              <span>Local Creative Suite</span>
            </div>
            <button
              type="button"
              className="app-sidebar-collapse"
              onClick={toggleCollapsed}
              aria-label="收起侧边栏"
              title="收起侧边栏"
            >
              <ChevronLeft size={15} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <nav className="app-sidebar-nav">
        {SIDEBAR_TOOLS.map((tool) => {
          const ToolIcon = tool.icon;
          const groupLabel = GROUP_LABELS[tool.group];
          const showLabel = groupLabel && groupLabel !== lastGroup;
          if (groupLabel !== lastGroup) lastGroup = groupLabel;
          const active = activeTool === tool.id;
          return (
            <div key={tool.id} style={{ display: 'contents' }}>
              {showLabel ? <div className="app-sidebar-label">{groupLabel}</div> : null}
              <button
                type="button"
                className={`app-sidebar-item${active ? ' active' : ''}`}
                onClick={() => onNavigate(tool.id)}
                aria-current={active ? 'page' : undefined}
                aria-label={tool.label}
                title={tool.label}
              >
                <span className="app-sidebar-icon"><ToolIcon size={16} strokeWidth={1.6} aria-hidden="true" /></span>
                <span className="app-sidebar-copy">{tool.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      <div className="app-sidebar-foot">
        <button type="button" className="app-sidebar-item" onClick={onOpenSettings} aria-label="设置" title="设置">
          <span className="app-sidebar-icon"><Settings size={16} strokeWidth={1.6} aria-hidden="true" /></span>
          <span className="app-sidebar-copy">设置</span>
        </button>
        <div className="app-sidebar-local-note">
          <b>v{packageMetadata.version}</b>
          <span>素材仅在本机处理</span>
        </div>
      </div>
    </aside>
  );
}
