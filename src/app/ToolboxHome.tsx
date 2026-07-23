type ToolboxHomeProps = {
  onOpenLogoLayout: () => void;
  onOpenGifMediaPreview: () => void;
  onOpenSettings: () => void;
};

const TOOLS = [
  {
    id: 'logo-layout',
    label: 'Logo 与版式',
    detail: '设媒工作台与自定义构图',
    action: '进入工作台',
    available: true,
    experimental: false
  },
  {
    id: 'gif-media',
    label: 'GIF / 媒体工具',
    detail: 'MP4 / MOV 转 GIF，本地队列处理',
    action: '打开 GIF 工具',
    available: true,
    experimental: true
  },
  {
    id: 'watermark-trace',
    label: '水印与追溯',
    detail: '本地水印与追溯能力仍在规划中',
    action: '即将开放',
    available: false,
    experimental: false
  }
] as const;

export function getToolboxLaunchAction(toolId: typeof TOOLS[number]['id'], handlers: Pick<ToolboxHomeProps, 'onOpenLogoLayout' | 'onOpenGifMediaPreview'>): (() => void) | undefined {
  if (toolId === 'logo-layout') return handlers.onOpenLogoLayout;
  if (toolId === 'gif-media') return handlers.onOpenGifMediaPreview;
  return undefined;
}

export function ToolboxHome({ onOpenLogoLayout, onOpenGifMediaPreview, onOpenSettings }: ToolboxHomeProps) {
  return (
    <main className="toolbox-home" aria-label="品宣工具箱">
      <header className="toolbox-home-header">
        <div>
          <h1>品宣工具箱</h1>
          <p>选择要使用的本地工具。</p>
        </div>
      </header>
      <section className="toolbox-tool-grid" aria-label="工具入口">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`toolbox-launch-card ${tool.available ? 'is-available' : 'is-unavailable'}`}
            disabled={!tool.available}
            onClick={getToolboxLaunchAction(tool.id, { onOpenLogoLayout, onOpenGifMediaPreview })}
            aria-label={tool.available ? `${tool.label}，${tool.action}` : `${tool.label}，${tool.action}`}
          >
            <span className="toolbox-launch-status">{tool.experimental ? '内部实验' : tool.available ? '可用' : '暂不可用'}</span>
            <strong>{tool.label}</strong>
            <small>{tool.detail}</small>
            <span className="toolbox-launch-action">{tool.action}</span>
          </button>
        ))}
        <button type="button" className="toolbox-launch-card is-available" onClick={onOpenSettings} aria-label="设置，打开应用设置">
          <span className="toolbox-launch-status">可用</span>
          <strong>设置</strong>
          <small>查看应用级偏好与当前版本信息</small>
          <span className="toolbox-launch-action">打开设置</span>
        </button>
      </section>
    </main>
  );
}
