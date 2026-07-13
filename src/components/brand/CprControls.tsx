import type { BrandColorMode, CprPlacement, CprState } from '../../core';
import { BrandEffectControls } from './BrandEffectControls';

const PLACEMENTS: Array<{ value: CprPlacement; label: string }> = [
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-center', label: '底部居中' },
  { value: 'bottom-right', label: '右下' }
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
