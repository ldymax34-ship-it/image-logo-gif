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

export const OUTPUT_LANGUAGE_CODES: Readonly<Record<string, string>> = {
  '中文': 'zh',
  '简中': 'zh',
  'zh-CN': 'zh',
  '繁中': 'tw',
  'zh-TW': 'tw',
  '英语': 'en',
  '英文': 'en',
  'en-US': 'en',
  '日语': 'ja',
  '日文': 'ja',
  'ja-JP': 'ja',
  '韩语': 'ko',
  '韩文': 'ko',
  'ko-KR': 'ko',
  '德语': 'de',
  'de-DE': 'de',
  '法语': 'fr',
  'fr-FR': 'fr',
  '西班牙语': 'es',
  'es-ES': 'es',
  '泰语': 'th',
  'th-TH': 'th',
  '葡语': 'PT',
  'pt-PT': 'PT'
};

export function getOutputLanguageCode(language: string): string {
  return OUTPUT_LANGUAGE_CODES[language] ?? language;
}

export type FileNameOptions = {
  batchName?: string;
  sourceName?: string;
  language?: string;
  index?: number;
  maxBaseLength?: number;
  /** 0.1.31: include the spec name (e.g. "横版") in the file name. */
  includeSpecName?: boolean;
  /** 0.1.31: include the numeric index prefix. */
  includeIndex?: boolean;
  /** 0.1.31: append a disambiguation suffix for same-name collisions across assets. */
  disambiguation?: string;
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
  const index = options.includeIndex && options.index != null ? String(options.index + 1).padStart(2, '0') : '';
  const specName = options.includeSpecName ? spec.name || undefined : undefined;
  const language = options.language ? getOutputLanguageCode(options.language) : undefined;
  const parts = [
    index,
    options.batchName,
    options.sourceName,
    language,
    specName,
    `${spec.width}x${spec.height}`,
    options.disambiguation
  ].filter((part): part is string => Boolean(part));
  const base = sanitizeFileNamePart(parts.join('_'), 'material', options.maxBaseLength ?? 120);
  return `${base}.${spec.format}`;
}
