import type { BrandColorMode } from './brandTypes';

export const CPR_PRESET = {
  text: '©KURO GAMES ALL RIGHTS RESERVED',
  fontFamily: '"Source Han Sans", "Source Han Sans CN", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontWeight: '400',
  baseFontSize: 12,
  baseGridUnit: 60
} as const;

export function getCprFontSize(gridUnit: number): number {
  return Math.max(6, CPR_PRESET.baseFontSize * (gridUnit / CPR_PRESET.baseGridUnit));
}

export function getBrandColor(mode: BrandColorMode): string | undefined {
  if (mode === 'white') return '#ffffff';
  if (mode === 'black') return '#000000';
  return undefined;
}
