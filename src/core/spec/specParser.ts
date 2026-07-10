export type MaterialFormat = 'jpg' | 'png';

export type MaterialSpec = {
  id: string;
  name: string;
  width: number;
  height: number;
  format: MaterialFormat;
  maxSizeKb?: number;
  requirementDetail?: string;
};

export type UnrecognizedLine = {
  lineNumber: number;
  text: string;
  reason: string;
};

export type ParseSpecResult = {
  specs: MaterialSpec[];
  unrecognizedLines: UnrecognizedLine[];
};

const DIRECT_DIM_RE = /(\d{2,5})\s*(?:px)?\s*[xX×＊*]\s*(\d{2,5})\s*(?:px)?/g;
const RATIO_RE = /(\d{1,3})\s*[:：]\s*(\d{1,3})\s+(\d{2,5})/;
const SIZE_LIMIT_RE = /(\d+(?:\.\d+)?)\s*(kb|k|mb|m)\b/i;
const FORMAT_RE = /\b(jpe?g|png)\b/i;

type BuildSpecInput = {
  width: number;
  height: number;
  line: string;
  occurrence: number;
};

function normalizeText(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[；;]/g, '\n')
    .replace(/[，、]+/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function detectFormat(text: string): MaterialFormat {
  const raw = text.match(FORMAT_RE)?.[1]?.toLowerCase();
  return raw === 'png' ? 'png' : 'jpg';
}

function detectMaxSizeKb(text: string): number | undefined {
  const match = text.match(SIZE_LIMIT_RE);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = match[2].toLowerCase();
  return unit.startsWith('m') ? Math.round(value * 1024) : Math.round(value);
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isValidDimension(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 16 && height >= 16 && width <= 30000 && height <= 30000;
}

function makeName(width: number, height: number, prefix?: string): string {
  const cleaned = String(prefix || '')
    .replace(DIRECT_DIM_RE, ' ')
    .replace(RATIO_RE, ' ')
    .replace(SIZE_LIMIT_RE, ' ')
    .replace(FORMAT_RE, ' ')
    .replace(/(?:尺寸|规格|画板|输出|宽|高|px|像素|大小|限制|不超过|小于|≤|<=)[:：]?/gi, ' ')
    .replace(/[【】\[\]{}()（）|｜/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[_\-\s]+|[_\-\s]+$/g, '')
    .trim();
  return cleaned ? cleaned.slice(0, 32) : `${width}x${height}`;
}

function parseSpaceDimension(line: string): { width: number; height: number } | null {
  if (RATIO_RE.test(line)) return null;
  const cells = line
    .split(/\t+|\s{1,}/)
    .map((x) => x.trim())
    .filter(Boolean);
  const numeric = cells.filter((x) => /^\d{2,5}$/.test(x)).map((x) => Number(x));
  if (numeric.length < 2) return null;
  const [width, height] = numeric;
  return isValidDimension(width, height) ? { width, height } : null;
}

function parseRatioDimension(line: string): { width: number; height: number } | null {
  const match = line.match(RATIO_RE);
  if (!match) return null;
  const ratioW = Number(match[1]);
  const ratioH = Number(match[2]);
  const longOrWidth = Number(match[3]);
  if (!ratioW || !ratioH || !longOrWidth) return null;
  const width = longOrWidth;
  const height = Math.max(1, Math.round((longOrWidth * ratioH) / ratioW));
  return isValidDimension(width, height) ? { width, height } : null;
}

function buildSpecSignature(input: Omit<MaterialSpec, 'id'>): string {
  return [
    input.width,
    input.height,
    input.format,
    input.maxSizeKb ?? ''
  ].join('|');
}

function buildStableSpecId(signature: string, occurrence: number): string {
  return `spec_${hashString(`${signature}|${occurrence}`)}`;
}

function buildSpec({ width, height, line, occurrence }: BuildSpecInput): MaterialSpec {
  const nextSpec = {
    name: makeName(width, height, line),
    width,
    height,
    format: detectFormat(line),
    maxSizeKb: detectMaxSizeKb(line),
    requirementDetail: ''
  } satisfies Omit<MaterialSpec, 'id'>;
  return {
    id: buildStableSpecId(buildSpecSignature(nextSpec), occurrence),
    ...nextSpec
  };
}

export function parseSpecText(text: string): ParseSpecResult {
  const normalized = normalizeText(text);
  if (!normalized) return { specs: [], unrecognizedLines: [] };
  const specs: MaterialSpec[] = [];
  const unrecognizedLines: UnrecognizedLine[] = [];
  const specOccurrences = new Map<string, number>();
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  function pushSpec(width: number, height: number, line: string) {
    const signature = buildSpecSignature({
      name: makeName(width, height, line),
      width,
      height,
      format: detectFormat(line),
      maxSizeKb: detectMaxSizeKb(line),
      requirementDetail: ''
    });
    const occurrence = specOccurrences.get(signature) ?? 0;
    specOccurrences.set(signature, occurrence + 1);
    specs.push(buildSpec({ width, height, line, occurrence }));
  }

  lines.forEach((line, lineIndex) => {
    let found = 0;
    const dimensionsOnLine = new Set<string>();
    for (const match of line.matchAll(DIRECT_DIM_RE)) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      const dimensionKey = `${width}x${height}`;
      if (isValidDimension(width, height) && !dimensionsOnLine.has(dimensionKey)) {
        dimensionsOnLine.add(dimensionKey);
        pushSpec(width, height, line);
        found += 1;
      }
    }
    if (!found) {
      const ratioDim = parseRatioDimension(line);
      if (ratioDim) {
        pushSpec(ratioDim.width, ratioDim.height, line);
        found += 1;
      }
    }
    if (!found) {
      const spaceDim = parseSpaceDimension(line);
      if (spaceDim) {
        pushSpec(spaceDim.width, spaceDim.height, line);
        found += 1;
      }
    }
    if (!found) {
      unrecognizedLines.push({ lineNumber: lineIndex + 1, text: line, reason: '未识别到尺寸' });
    }
  });

  return { specs, unrecognizedLines };
}
