import type { BrandColorMode, CprPlacement, CprState } from '../../core';
import { BrandEffectControls } from './BrandEffectControls';
import { SectionHeader } from '../ui';

const PLACEMENTS: Array<{ value: CprPlacement; label: string }> = [
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-center', label: '底部居中' },
  { value: 'bottom-right', label: '右下' },
  { value: 'custom', label: '自定义' }
];

const COLORS: Array<{ value: BrandColorMode; label: string }> = [
  { value: 'original', label: '原色' },
  { value: 'white', label: '白色' },
  { value: 'black', label: '黑色' },
  { value: 'custom', label: '自定义' }
];

/** Keeps the custom color value intact while the selected render mode changes. */
export function setCprColorMode(state: CprState, colorMode: BrandColorMode): CprState {
  return { ...state, colorMode };
}

export function CprControls({ state, onChange, onApplySameSpec, onApplySameAsset, sectionState }: { state: CprState; onChange: (state: CprState) => void; onApplySameSpec?: () => void; onApplySameAsset?: () => void; sectionState?: 'active' }) {
  const patch = (next: Partial<CprState>) => onChange({ ...state, ...next });
  const patchTransform = (next: Partial<CprState['transform']>) => patch({ transform: { ...state.transform, ...next } });
  // colorMode controls the resolved render color. effect.color stores the user's
  // custom color so switching away from and back to custom never discards it.
  const setColor = (colorMode: BrandColorMode) => onChange(setCprColorMode(state, colorMode));

  return (
    <section className="brand-control-group" aria-labelledby="cpr-controls-title">
      <SectionHeader id="cpr-controls-title" title="CPR" description="固定 SVG 图层" state={sectionState ?? (state.enabled ? 'idle' : 'disabled')}>
        <label className="toggle compact-toggle">
          <input type="checkbox" checked={state.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
          显示
        </label>
      </SectionHeader>
      <label className="control-row">
        <span>位置</span>
        <select value={state.transform.placement} onChange={(event) => patchTransform({ placement: event.target.value as CprPlacement, offsetX: 0, offsetY: 0 })}>
          {PLACEMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {state.transform.placement === 'custom' ? <small className="inline-note">可在“画板调整 → CPR 位置”中拖动，并使用下方微调。</small> : null}
      <div className="control-row cpr-nudge-row">
        <span>向下微调</span>
        <input type="range" min="-240" max="240" step="1" value={state.transform.offsetY} onChange={(event) => patchTransform({ offsetY: Number(event.target.value) })} />
      </div>
      <label className="range-field compact-range">
        <span>连续缩放 {Math.round((state.scale ?? 1) * 100)}%</span>
        <input type="range" min="0.5" max="2" step="0.01" value={state.scale ?? 1} onChange={(event) => patch({ scale: Number(event.target.value) })} />
      </label>
      <button type="button" onClick={() => patchTransform({ placement: state.transform.placement === 'custom' ? 'bottom-right' : state.transform.placement, offsetX: 0, offsetY: 0 })}>恢复推荐位置</button>
      <div className="control-row cpr-color-row">
        <span>颜色</span>
        <div className="segmented-control compact-segments cpr-color-mode">
          {COLORS.map((item) => <button key={item.value} type="button" className={state.colorMode === item.value ? 'active' : ''} onClick={() => setColor(item.value)}>{item.label}</button>)}
        </div>
      </div>
      {state.colorMode === 'custom' ? <label className="control-row"><span>颜色</span><input className="color-input" type="color" value={state.effect.color} onChange={(event) => patch({ effect: { ...state.effect, color: event.target.value } })} aria-label="CPR 自定义颜色" /></label> : null}
      <BrandEffectControls title="CPR" effect={state.effect} onChange={(effect) => patch({ effect })} hideColorControls />
      {onApplySameSpec || onApplySameAsset ? <div className="brand-apply-actions"><span>应用范围</span>{onApplySameSpec ? <button type="button" onClick={onApplySameSpec}>同尺寸</button> : null}{onApplySameAsset ? <button type="button" onClick={onApplySameAsset}>同素材</button> : null}</div> : null}
    </section>
  );
}
