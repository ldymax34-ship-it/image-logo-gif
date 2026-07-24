import { Palette, Film, Layers, ShieldCheck, Settings } from 'lucide-react';

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
  icon: typeof Palette;
  action: () => void;
  available: boolean;
  experimental: boolean;
};

export function ToolboxHome({ onOpenLogoLayout, onOpenGifCompress, onOpenBatchTemplateGif, onOpenWatermarkTrace, onOpenSettings }: ToolboxHomeProps) {
  const tools: ToolEntry[] = [
    { id: 'logo-layout', label: 'Logo 与版式', icon: Palette, action: onOpenLogoLayout, available: true, experimental: false },
    { id: 'gif-compress', label: 'GIF 合成与压缩', icon: Film, action: onOpenGifCompress, available: true, experimental: false },
    { id: 'batch-template-gif', label: '批量模板 GIF 合成器', icon: Layers, action: onOpenBatchTemplateGif, available: true, experimental: true },
    { id: 'watermark-trace', label: '水印与追溯', icon: ShieldCheck, action: onOpenWatermarkTrace, available: true, experimental: true },
    { id: 'settings', label: '设置', icon: Settings, action: onOpenSettings, available: true, experimental: false },
  ];

  const Icon = ({ icon: IconComponent }: { icon: typeof Palette }) => <IconComponent size={28} strokeWidth={1.4} aria-hidden="true" />;

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
