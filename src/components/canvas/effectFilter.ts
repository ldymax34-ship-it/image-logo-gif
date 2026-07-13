import type { BrandEffectState } from '../../core';

export function hexToRgba(hex: string, opacity: number): string {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(0,0,0,${opacity})`;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${Math.min(1, Math.max(0, opacity))})`;
}

export function buildDropShadowFilter(effect: BrandEffectState, scale = 1): string | undefined {
  const filters: string[] = [];
  if (effect.strokeEnabled && effect.strokeWidth > 0) {
    const width = Math.max(1, effect.strokeWidth * scale);
    const directions = [
      [width, 0],
      [-width, 0],
      [0, width],
      [0, -width],
      [width, width],
      [-width, width],
      [width, -width],
      [-width, -width]
    ];
    for (const [x, y] of directions) {
      filters.push(`drop-shadow(${x}px ${y}px 0 ${effect.strokeColor})`);
    }
  }
  if (effect.glowEnabled && effect.glowBlur > 0) {
    filters.push(`drop-shadow(0 0 ${effect.glowBlur * scale}px ${effect.glowColor})`);
  }
  if (effect.shadowEnabled && effect.shadowBlur > 0) {
    filters.push(
      `drop-shadow(${effect.shadowOffsetX * scale}px ${effect.shadowOffsetY * scale}px ${effect.shadowBlur * scale}px ${hexToRgba(
        effect.shadowColor,
        effect.shadowOpacity
      )})`
    );
  }
  return filters.length ? filters.join(' ') : undefined;
}
