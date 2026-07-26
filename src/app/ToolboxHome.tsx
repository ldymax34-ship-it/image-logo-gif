import {
  ArrowUpRight,
  Film,
  Layers3,
  LockKeyhole,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon
} from 'lucide-react';

type ToolboxHomeProps = {
  onOpenLogoLayout: () => void;
  onOpenGifCompress: () => void;
  onOpenBatchTemplateGif: () => void;
  onOpenWatermarkTrace: () => void;
  onOpenSettings: () => void;
};

type ToolEntry = {
  id: string;
  label: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  action: () => void;
  experimental: boolean;
};

export function ToolboxHome({ onOpenLogoLayout, onOpenGifCompress, onOpenBatchTemplateGif, onOpenWatermarkTrace, onOpenSettings }: ToolboxHomeProps) {
  const tools: ToolEntry[] = [
    {
      id: 'logo-layout',
      label: 'Logo 与版式',
      description: '批量套用 Logo、CPR 与常用画板尺寸，统一输出品宣图片。',
      eyebrow: '图片生产',
      icon: Palette,
      action: onOpenLogoLayout,
      experimental: false
    },
    {
      id: 'gif-compress',
      label: 'GIF 合成与压缩',
      description: '截取视频片段、预览压缩结果，并自动控制在 8MB 以内。',
      eyebrow: '动效处理',
      icon: Film,
      action: onOpenGifCompress,
      experimental: false
    },
    {
      id: 'batch-template-gif',
      label: '批量模板 GIF 合成器',
      description: '把视频批量装入 PNG 模板，面向多语言与多版位生产。',
      eyebrow: '批量合成',
      icon: Layers3,
      action: onOpenBatchTemplateGif,
      experimental: true
    },
    {
      id: 'watermark-trace',
      label: '水印与追溯',
      description: '在画布中直接调整文字或 Logo 水印，再按队列批量落盘。',
      eyebrow: '内容保护',
      icon: ShieldCheck,
      action: onOpenWatermarkTrace,
      experimental: true
    }
  ];

  const Icon = ({ icon: IconComponent }: { icon: LucideIcon }) => <IconComponent size={30} strokeWidth={1.55} aria-hidden="true" />;

  return (
    <main className="toolbox-home" aria-label="品宣工具箱">
      <header className="toolbox-home-header">
        <div className="toolbox-brand-lockup">
          <span className="toolbox-brand-mark" aria-hidden="true"><Sparkles size={22} strokeWidth={1.6} /></span>
          <div>
            <span className="toolbox-home-kicker">LOCAL CREATIVE SUITE</span>
            <h1>品宣工具箱</h1>
          </div>
        </div>
        <button type="button" className="toolbox-settings-button" onClick={onOpenSettings} aria-label="设置">
          <Settings size={17} strokeWidth={1.7} aria-hidden="true" />
          <span>设置</span>
        </button>
      </header>

      <section className="toolbox-home-intro" aria-labelledby="toolbox-home-title">
        <div>
          <span className="toolbox-home-kicker">START A WORKFLOW</span>
          <h2 id="toolbox-home-title">今天要处理什么？</h2>
          <p>四个工具共享本地素材与转换引擎，但各自保留独立任务和输出状态。</p>
        </div>
        <div className="toolbox-trust-note"><LockKeyhole size={15} aria-hidden="true" /><span>素材仅在本机处理</span></div>
      </section>

      <nav className="toolbox-launcher" aria-label="工具入口">
        {tools.map((tool) => {
          const ToolIcon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              className={`toolbox-tool-button toolbox-tool-${tool.id}`}
              onClick={tool.action}
              aria-label={tool.label}
            >
              <span className="toolbox-tool-icon"><Icon icon={ToolIcon} /></span>
              <span className="toolbox-tool-copy">
                <span className="toolbox-tool-meta">
                  <span>{tool.eyebrow}</span>
                  {tool.experimental ? <span className="toolbox-tool-badge">实验</span> : <span className="toolbox-tool-badge is-stable">可用</span>}
                </span>
                <strong className="toolbox-tool-name">{tool.label}</strong>
                <span className="toolbox-tool-description">{tool.description}</span>
              </span>
              <span className="toolbox-tool-action" aria-hidden="true">打开<ArrowUpRight size={16} /></span>
            </button>
          );
        })}
      </nav>

      <footer className="toolbox-home-footer">
        <span>4 个生产工具</span>
        <span aria-hidden="true">·</span>
        <span>统一深色工作区</span>
        <span aria-hidden="true">·</span>
        <span>本地 FFmpeg 引擎</span>
      </footer>
    </main>
  );
}
