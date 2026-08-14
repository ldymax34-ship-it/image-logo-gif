import {
  ArrowUpRight,
  Fingerprint,
  LockKeyhole,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  Video,
  type LucideIcon
} from 'lucide-react';

type ToolboxHomeProps = {
  onOpenLogoLayout: () => void;
  onOpenWatermark: () => void;
  onOpenVideoWatermark?: () => void;
  onOpenSettings: () => void;
};

type ToolEntry = {
  id: string;
  label: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  action?: () => void;
  enabled: boolean;
  hidden?: boolean;
};

export function ToolboxHome({ onOpenLogoLayout, onOpenWatermark, onOpenVideoWatermark, onOpenSettings }: ToolboxHomeProps) {

  const tools: ToolEntry[] = [
    {
      id: 'logo-layout',
      label: 'Logo 与版式',
      description: '批量套用 Logo、CPR 与常用画板尺寸，统一输出品宣图片。',
      eyebrow: '图片生产',
      icon: Palette,
      action: onOpenLogoLayout,
      enabled: true
    },
    {
      id: 'watermark',
      label: '水印工具',
      description: '在同一工作台中处理图片与视频，统一配置文字或 Logo 水印。',
      eyebrow: '内容保护',
      icon: ShieldCheck,
      action: onOpenWatermark,
      enabled: true
    },
    {
      id: 'dark-watermark',
      label: '暗水印与像素指纹（实验）',
      description: '用于更隐蔽的内容追踪与像素级来源识别。',
      eyebrow: '隐形追溯',
      icon: Fingerprint,
      enabled: false,
      hidden: true
    },
    {
      id: 'video-watermark',
      label: '视频水印',
      description: '直接进入水印工具的视频模式，生成预览并按序输出 MP4。',
      eyebrow: '视频保护',
      icon: Video,
      action: onOpenVideoWatermark,
      enabled: Boolean(onOpenVideoWatermark)
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
        {tools.filter((tool) => !tool.hidden).map((tool) => {
          const ToolIcon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              className={`toolbox-tool-button toolbox-tool-${tool.id}${tool.enabled ? '' : ' is-disabled'}`}
              onClick={tool.action}
              aria-label={tool.label}
              disabled={!tool.enabled}
            >
              <span className="toolbox-tool-icon"><Icon icon={ToolIcon} /></span>
              <span className="toolbox-tool-copy">
                <span className="toolbox-tool-meta">
                  <span>{tool.eyebrow}</span>
                  {tool.enabled ? <span className="toolbox-tool-badge is-stable">可用</span> : <span className="toolbox-tool-badge">未开启</span>}
                </span>
                <strong className="toolbox-tool-name">{tool.label}</strong>
                <span className="toolbox-tool-description">{tool.description}</span>
              </span>
              <span className="toolbox-tool-action" aria-hidden="true">{tool.enabled ? <><span>打开</span><ArrowUpRight size={16} /></> : '未开启'}</span>
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
