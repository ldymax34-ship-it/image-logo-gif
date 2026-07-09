import type { MaterialSpec } from '../spec/specParser';

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
]);

export type FileNameOptions = {
  batchName?: string;
  sourceName?: string;
  language?: string;
  index?: number;
  maxBaseLength?: number;
};

export function sanitizeFileNamePart(input: string, fallback = 'untitled', maxLength = 80): string {
  const normalized = String(input || '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+/g, '')
    .replace(/[. ]+$/g, '');
  const safe = normalized || fallback;
  const base = safe.slice(0, maxLength).trim() || fallback;
  return WINDOWS_RESERVED_NAMES.has(base.toUpperCase()) ? `_${base}` : base;
}

export function buildOutputFileName(spec: MaterialSpec, options: FileNameOptions = {}): string {
  const index = options.index == null ? '' : String(options.index + 1).padStart(2, '0');
  const parts = [
    index,
    options.batchName,
    options.sourceName,
    options.language,
    spec.name || `${spec.width}x${spec.height}`,
    `${spec.width}x${spec.height}`
  ].filter(Boolean);
  const base = sanitizeFileNamePart(parts.join('_'), 'material', options.maxBaseLength ?? 120);
  return `${base}.${spec.format}`;
}
