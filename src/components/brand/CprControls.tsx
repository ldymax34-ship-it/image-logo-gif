import type { BrandColorMode, CprPlacement, CprState } from '../../core';
import { BrandEffectControls } from './BrandEffectControls';

const PLACEMENTS: Array<{ value: CprPlacement; label: string }> = [
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-center', label: '底部居中' },
  { value: 'bottom-right', label: '右下' },
  { value: 'custom', label: '自定义' }
];

const COLORS: Array<{ value: BrandColorMode; label: string }> = [
  { value: 'white', label: '白' },
  { value: 'black', label: '黑' },
  { value: 'original', label: '原始' }
];

export function CprControls({ state, onChange }: { state: CprState; onChange: (state: CprState) => void }) {
  const patch = (next: Partial<CprState>) => onChange({ ...state, ...next });
  const setColor = (colorMode: BrandColorMode) => patch({
    colorMode,
    effect: {
      ...state.effect,
      colorEnabled: colorMode !== 'original',
      color: colorMode === 'black' ? '#000000' : '#ffffff'
    }
  });

  return (
    <section className="brand-control-group" aria-labelledby="cpr-controls-title">
      <div className="brand-control-heading">
        <div><h3 id="cpr-controls-title">CPR</h3><small>固定 SVG 品牌组件</small></div>
        <label className="toggle compact-toggle">
          <input type="checkbox" checked={state.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
          显示
        </label>
      </div>
      <label className="control-row">
        <span>位置</span>
        <select value={state.placement} onChange={(event) => patch({ placement: event.target.value as CprPlacement })}>
          {PLACEMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {state.placement === 'custom' ? <small className="inline-note">可在“画板调整 → CPR 位置”中拖动，并使用下方微调。</small> : null}
      <div className="control-row cpr-nudge-row">
        <span>向下微调</span>
        <input type="range" min="0" max="240" step="1" value={state.manualOffset?.y ?? 0} onChange={(event) => patch({ placement: 'custom', manualOffset: { x: state.manualOffset?.x ?? 0, y: Number(event.target.value) } })} />
      </div>
      <div className="control-row">
        <span>颜色</span>
        <div className="segmented-control compact-segments">
          {COLORS.map((item) => <button key={item.value} type="button" className={state.colorMode === item.value ? 'active' : ''} onClick={() => setColor(item.value)}>{item.label}</button>)}
        </div>
      </div>
      <BrandEffectControls title="CPR" effect={state.effect} onChange={(effect) => patch({ effect })} />
    </section>
  );
}
