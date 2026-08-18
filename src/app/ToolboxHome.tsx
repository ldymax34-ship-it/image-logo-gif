import {
  ArrowUpRight,
  LockKeyhole,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  Video,
  type LucideIcon
} from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { isDesktopBridgeAvailable } from '../platform/desktopBridge';
import { GlobalTopActions } from './GlobalTopActions';
import type { AppTool } from './AppRuntimeProvider';
import type { RecentToolEntry } from './appHistory';

type ToolboxHomeProps = {
  onOpenLogoLayout: () => void;
  onOpenWatermark: () => void;
  onOpenVideoWatermark?: () => void;
  onOpenSettings: () => void;
  onOpenChangelog?: () => void;
  recentTools?: RecentToolEntry[];
  onOpenRecentTool?: (tool: AppTool) => void;
  isDesktop?: boolean;
};

type ToolEntry = {
  id: string;
  label: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  action?: () => void;
  tone: 'logo' | 'watermark' | 'video';
};

function trackPointerHighlight(event: ReactPointerEvent<HTMLButtonElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
}

const RECENT_TOOL_META: Record<string, { label: string; icon: LucideIcon }> = {
  'logo-layout': { label: 'Logo 与版式', icon: Palette },
  watermark: { label: '水印工具', icon: ShieldCheck },
  'video-watermark': { label: '视频水印', icon: Video }
};

function formatRecentTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function ToolboxHome({ onOpenLogoLayout, onOpenWatermark, onOpenVideoWatermark, onOpenSettings, onOpenChangelog, recentTools, onOpenRecentTool, isDesktop }: ToolboxHomeProps) {
  const desktop = isDesktop ?? isDesktopBridgeAvailable();

  const tools: ToolEntry[] = [
    {
      id: 'logo-layout',
      label: 'Logo 与版式',
      description: '批量套用 Logo、CPR 与常用画板尺寸，统一输出品宣图片。',
      eyebrow: '图片生产',
      icon: Palette,
      action: onOpenLogoLayout,
      tone: 'logo'
    },
    {
      id: 'watermark',
      label: '水印工具',
      description: '处理图片文字或 Logo 水印，统一配置与批量输出。',
      eyebrow: '内容保护',
      icon: ShieldCheck,
      action: onOpenWatermark,
      tone: 'watermark'
    },
    {
      id: 'video-watermark',
      label: '视频水印',
      description: '直接进入水印工具的视频模式，生成预览并按序输出 MP4。',
      eyebrow: '视频保护',
      icon: Video,
      action: onOpenVideoWatermark,
      tone: 'video'
    }
  ];

  const renderToolCard = (tool: ToolEntry) => {
    const ToolIcon = tool.icon;
    return (
      <button
        key={tool.id}
        type="button"
        className={`toolbox-tool-button toolbox-tool-${tool.id}`}
        data-tone={tool.tone}
        onClick={tool.action}
        onPointerMove={trackPointerHighlight}
        aria-label={tool.label}
      >
        <span className="toolbox-tool-icon"><ToolIcon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
        <span className="toolbox-tool-copy">
          <span className="toolbox-tool-meta">
            <span>{tool.eyebrow}</span>
            <span className="toolbox-tool-badge is-stable">可用</span>
          </span>
          <strong className="toolbox-tool-name">{tool.label}</strong>
          <span className="toolbox-tool-description">{tool.description}</span>
        </span>
        <span className="toolbox-tool-action" aria-hidden="true"><span>打开</span><ArrowUpRight size={16} /></span>
      </button>
    );
  };

  return (
    <main className="toolbox-home" aria-label="品宣工具箱">
      <header className="toolbox-home-header">
        <div className="toolbox-brand-lockup">
          <span className="toolbox-brand-mark" aria-hidden="true"><Sparkles size={18} strokeWidth={1.6} /></span>
          <div>
            <span className="toolbox-home-kicker">品宣物料工作台 · 本地生产工具</span>
            <h1>品宣工具箱</h1>
          </div>
        </div>
        <div className="toolbox-home-actions">
          <GlobalTopActions onOpenChangelog={onOpenChangelog} />
          <button type="button" className="toolbox-settings-button" onClick={onOpenSettings} aria-label="设置">
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" />
            <span>设置</span>
          </button>
        </div>
      </header>

      <section className="toolbox-home-intro" aria-labelledby="toolbox-home-title">
        <div>
          <span className="toolbox-home-kicker">开始工作</span>
          <h2 id="toolbox-home-title">今天要处理什么？</h2>
          <p>各工具共享本地素材与转换引擎，各自保留独立任务与输出状态。</p>
        </div>
        <div className="toolbox-trust-note"><LockKeyhole size={14} aria-hidden="true" /><span>素材仅在本机处理</span></div>
      </section>

      <div className="toolbox-section-heading">生产工具</div>
      <nav className="toolbox-launcher" aria-label="生产工具">
        {tools.map(renderToolCard)}
      </nav>

      {recentTools && recentTools.length > 0 && onOpenRecentTool ? (
        <>
          <div className="toolbox-section-heading">最近使用</div>
          <div className="toolbox-recent" aria-label="最近使用">
            {recentTools.map((entry) => {
              const meta = RECENT_TOOL_META[entry.tool];
              if (!meta) return null;
              const RecentIcon = meta.icon;
              return (
                <button key={entry.tool} type="button" className="toolbox-recent-row" onClick={() => onOpenRecentTool(entry.tool)}>
                  <span className="toolbox-recent-icon"><RecentIcon size={15} strokeWidth={1.6} aria-hidden="true" /></span>
                  <span className="toolbox-recent-name">{meta.label}</span>
                  <span className="toolbox-recent-time">{formatRecentTime(entry.at)}</span>
                  <span className="toolbox-recent-action">继续</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {!desktop && (
        <aside className="toolbox-desktop-notice" role="note" aria-label="视频与 GIF 处理说明">
          <Video size={15} aria-hidden="true" />
          <span>视频 / GIF 处理仅支持桌面版，请使用品宣物料工作台客户端。</span>
        </aside>
      )}
    </main>
  );
}
