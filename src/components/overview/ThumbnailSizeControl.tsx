export const THUMBNAIL_SIZE_PRESETS = [
  { id: 'small', label: '小', value: 170 },
  { id: 'medium', label: '中', value: 220 },
  { id: 'large', label: '大', value: 290 }
] as const;

const SNAP_DISTANCE = 9;

export function snapThumbnailSize(value: number): number {
  const preset = THUMBNAIL_SIZE_PRESETS.find((candidate) => Math.abs(candidate.value - value) <= SNAP_DISTANCE);
  return preset?.value ?? value;
}

export function ThumbnailSizeControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="thumbnail-size-control" aria-label="缩略图大小">
      <span>缩略图</span>
      <div className="thumbnail-size-presets" role="group" aria-label="缩略图预设大小">
        {THUMBNAIL_SIZE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={value === preset.value ? 'active' : ''}
            onClick={() => onChange(preset.value)}
            aria-pressed={value === preset.value}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <input
        aria-label="调整缩略图大小"
        type="range"
        min="150"
        max="320"
        step="1"
        value={value}
        onChange={(event) => onChange(snapThumbnailSize(Number(event.target.value)))}
      />
    </div>
  );
}
