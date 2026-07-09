import { useMemo, useState } from 'react';
import { buildOutputFileName, classifyAspect, parseSpecText, renderBrandLayer, type MaterialSpec } from '../core';

const SAMPLE_TEXT = `1080x1920 jpg 1200KB
1920*1080 png 2MB
3840×2160
900 383
1:1 1024
16:9 1920
9:16 1080`;

const SAMPLE_LOGO = {
  id: 'logo_zh',
  kind: 'logo' as const,
  label: 'Logo 简中',
  language: 'zh-CN',
  viewBox: { width: 420, height: 120 }
};

const SAMPLE_CPR = {
  id: 'cpr_zh',
  kind: 'cpr' as const,
  label: 'CPR 简中',
  language: 'zh-CN',
  viewBox: { width: 520, height: 96 }
};

function PreviewStage({ spec }: { spec: MaterialSpec | undefined }) {
  const preview = useMemo(() => {
    if (!spec) return null;
    return renderBrandLayer({
      canvas: { width: spec.width, height: spec.height },
      includeLogo: true,
      includeCpr: true,
      logoAsset: SAMPLE_LOGO,
      cprAsset: SAMPLE_CPR,
      logoAnchor: 'top-right',
      cprAnchor: 'center',
      logoSize: 'standard',
      cprSize: 'standard'
    });
  }, [spec]);

  if (!spec || !preview) {
    return <div className="empty-state">粘贴尺寸片段后，这里会显示第一个画板的品牌层预览。</div>;
  }

  const scale = Math.min(520 / spec.width, 420 / spec.height, 1);
  const family = classifyAspect({ width: spec.width, height: spec.height });

  return (
    <div className="preview-shell">
      <div className="preview-meta">
        <span>{spec.width} x {spec.height}</span>
        <span>{family === 'landscape' ? '横版' : family === 'portrait' ? '竖版' : '方图'}</span>
      </div>
      <div
        className="preview-canvas"
        style={{
          width: spec.width * scale,
          height: spec.height * scale
        }}
      >
        <div className="safe-area" />
        {preview.layers.map((layer) => {
          const rect = layer.layout.rect;
          return (
            <div
              key={layer.id}
              className={`brand-layer ${layer.type}`}
              style={{
                left: rect.x * scale,
                top: rect.y * scale,
                width: rect.width * scale,
                height: rect.height * scale,
                zIndex: layer.zIndex
              }}
            >
              {layer.type === 'logo' ? 'LOGO' : 'CPR'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function App() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const result = useMemo(() => parseSpecText(text), [text]);
  const firstSpec = result.specs[0];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Brand Material Workbench · 0.1.1</p>
          <h1>品宣物料工作台</h1>
        </div>
        <div className="topbar-actions">
          <button type="button">导入素材</button>
          <button type="button" className="primary">导出批次</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel asset-panel">
          <h2>素材</h2>
          <div className="drop-zone">
            <strong>主视觉 / 已设计图</strong>
            <span>上传能力下一步接入；当前先验证尺寸与品牌层规则。</span>
          </div>
        </aside>

        <section className="panel preview-panel">
          <h2>预览</h2>
          <PreviewStage spec={firstSpec} />
        </section>

        <aside className="panel spec-panel">
          <div className="panel-heading">
            <h2>粘贴尺寸</h2>
            <span>{result.specs.length} 个画板</span>
          </div>
          <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
          <div className="spec-list">
            {result.specs.map((spec, index) => (
              <div key={spec.id} className="spec-row">
                <div>
                  <strong>{spec.name}</strong>
                  <span>{spec.width} x {spec.height} · {spec.format.toUpperCase()}</span>
                </div>
                <code>{buildOutputFileName(spec, { batchName: 'demo', index })}</code>
              </div>
            ))}
          </div>
          {result.unrecognizedLines.length > 0 && (
            <div className="warning-box">
              <strong>未识别行</strong>
              {result.unrecognizedLines.map((line) => (
                <span key={`${line.lineNumber}-${line.text}`}>第 {line.lineNumber} 行：{line.text}</span>
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
