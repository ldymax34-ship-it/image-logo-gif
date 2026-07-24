import { Palette, Film, ShieldCheck, Settings } from 'lucide-react';

type ToolboxHomeProps = {
  onOpenLogoLayout: () => void;
  onOpenGifMediaPreview: () => void;
  onOpenWatermarkTrace: () => void;
  onOpenSettings: () => void;
};

type ToolEntry = {
  id: string;
  label: string;
  icon: typeof Palette;
  action: () => void;
  available: boolean;
  experimental: boolean;
};

export function ToolboxHome({ onOpenLogoLayout, onOpenGifMediaPreview, onOpenWatermarkTrace, onOpenSettings }: ToolboxHomeProps) {
  const tools: ToolEntry[] = [
    { id: 'logo-layout', label: 'Logo 与版式', icon: Palette, action: onOpenLogoLayout, available: true, experimental: false },
    { id: 'gif-media', label: 'GIF / 媒体工具', icon: Film, action: onOpenGifMediaPreview, available: true, experimental: true },
    { id: 'watermark-trace', label: '水印与追溯', icon: ShieldCheck, action: onOpenWatermarkTrace, available: true, experimental: true },
    { id: 'settings', label: '设置', icon: Settings, action: onOpenSettings, available: true, experimental: false },
  ];

  const Icon = ({ icon: IconComponent }: { icon: typeof Palette }) => <IconComponent size={22} strokeWidth={1.5} aria-hidden="true" />;

  return (
    <main className="toolbox-home" aria-label="品宣工具箱">
      <header className="toolbox-home-header">
        <h1>品宣工具箱</h1>
        <p>选择要使用的本地工具</p>
      </header>
      <nav className="toolbox-launcher" aria-label="工具入口">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`toolbox-tool-button ${tool.available ? '' : 'is-unavailable'}`}
            disabled={!tool.available}
            onClick={tool.action}
            aria-label={tool.label}
          >
            <span className="toolbox-tool-icon"><Icon icon={tool.icon} /></span>
            <span className="toolbox-tool-name">{tool.label}</span>
            {tool.experimental && <span className="toolbox-tool-dot" aria-hidden="true" />}
          </button>
        ))}
      </nav>
    </main>
  );
}
