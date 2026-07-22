import type { ReactNode } from 'react';
import type { BrandEffectState } from '../../core';

export function BrandEffectControls({
  title,
  effect,
  onChange,
  preview,
  hideColorControls
}: {
  title: string;
  effect: BrandEffectState;
  onChange: (effect: BrandEffectState) => void;
  preview?: ReactNode;
  hideColorControls?: boolean;
}) {
  function patch(next: Partial<BrandEffectState>) {
    onChange({ ...effect, ...next });
  }

  return (
    <div className="brand-section effect-section">
      <details className="effect-details">
        <summary>{title} 高级样式</summary>
        {preview ? <div className="effect-preview">{preview}</div> : null}
        <div className="effect-grid">
          {hideColorControls ? null : (
            <>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={effect.colorEnabled}
                  onChange={(event) => patch({ colorEnabled: event.target.checked })}
                />
                改色
              </label>
              <input
                className="color-input"
                type="color"
                value={effect.color}
                onChange={(event) => patch({ color: event.target.value })}
                aria-label={`${title} 颜色`}
              />
            </>
          )}

          <label className="toggle">
            <input
              type="checkbox"
              checked={effect.strokeEnabled}
              onChange={(event) => patch({ strokeEnabled: event.target.checked })}
            />
            描边
          </label>
          <input
            className="color-input"
            type="color"
            value={effect.strokeColor}
            onChange={(event) => patch({ strokeColor: event.target.value })}
            aria-label={`${title} 描边颜色`}
          />
          <label className="range-field">
            <span>粗细</span>
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              value={effect.strokeWidth}
              onChange={(event) => patch({ strokeWidth: Number(event.target.value) })}
            />
          </label>

          <label className="toggle">
            <input checked={effect.glowEnabled} type="checkbox" onChange={(event) => patch({ glowEnabled: event.target.checked })} />
            外发光
          </label>
          <input
            className="color-input"
            type="color"
            value={effect.glowColor}
            onChange={(event) => patch({ glowColor: event.target.value })}
            aria-label={`${title} 外发光颜色`}
          />
          <label className="range-field">
            <span>强度</span>
            <input
              type="range"
              min="2"
              max="32"
              step="1"
              value={effect.glowBlur}
              onChange={(event) => patch({ glowBlur: Number(event.target.value) })}
            />
          </label>

          <label className="toggle">
            <input
              checked={effect.shadowEnabled}
              type="checkbox"
              onChange={(event) => patch({ shadowEnabled: event.target.checked })}
            />
            阴影
          </label>
          <input
            className="color-input"
            type="color"
            value={effect.shadowColor}
            onChange={(event) => patch({ shadowColor: event.target.value })}
            aria-label={`${title} 阴影颜色`}
          />
          <label className="range-field">
            <span>模糊</span>
            <input
              type="range"
              min="2"
              max="36"
              step="1"
              value={effect.shadowBlur}
              onChange={(event) => patch({ shadowBlur: Number(event.target.value) })}
            />
          </label>
          <label className="range-field">
            <span>Y</span>
            <input
              type="range"
              min="-24"
              max="24"
              step="1"
              value={effect.shadowOffsetY}
              onChange={(event) => patch({ shadowOffsetY: Number(event.target.value) })}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
