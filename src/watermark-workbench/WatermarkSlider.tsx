import * as Slider from '@radix-ui/react-slider';

export function WatermarkSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}) {
  const { label, value, min, max, step, onChange, onCommit, disabled, formatValue } = props;
  const display = formatValue ? formatValue(value) : String(value);
  return (
    <div className="wm-slider-field">
      <label className="wm-prop">
        <span>{label} {display}</span>
        <Slider.Root
          className="wm-slider-root"
          value={[value]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onValueChange={(values) => onChange(values[0] ?? min)}
          onValueCommit={(values) => onCommit?.(values[0] ?? min)}
          aria-label={label}
        >
          <Slider.Track className="wm-slider-track">
            <Slider.Range className="wm-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="wm-slider-thumb" aria-label={label} />
        </Slider.Root>
      </label>
    </div>
  );
}
