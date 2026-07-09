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

function isValidDimension(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 16 && height >= 16 && width <= 30000 && height <= 30000;
}

function makeName(width: number, height: number, index: number, prefix?: string): string {
  const cleaned = String(prefix || '')
    .replace(DIRECT_DIM_RE, ' ')
    .replace(RATIO_RE, ' ')
    .replace(SIZE_LIMIT_RE, ' ')
    .replace(FORMAT_RE, ' ')
    .replace(/(?:尺寸|规格|画板|输出|宽|高|px|像素|大小|限制|不超过|小于|≤|<=)[:：]?/gi, ' ')
    .replace(/[【】\[\]{}()（）|｜/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, 32) : `${width}x${height}_${index + 1}`;
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

function buildSpec(width: number, height: number, line: string, index: number): MaterialSpec {
  return {
    id: `spec_${index + 1}`,
    name: makeName(width, height, index, line),
    width,
    height,
    format: detectFormat(line),
    maxSizeKb: detectMaxSizeKb(line),
    requirementDetail: ''
  };
}

export function parseSpecText(text: string): ParseSpecResult {
  const normalized = normalizeText(text);
  if (!normalized) return { specs: [], unrecognizedLines: [] };
  const specs: MaterialSpec[] = [];
  const unrecognizedLines: UnrecognizedLine[] = [];
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, lineIndex) => {
    let found = 0;
    for (const match of line.matchAll(DIRECT_DIM_RE)) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (isValidDimension(width, height)) {
        specs.push(buildSpec(width, height, line, specs.length));
        found += 1;
      }
    }
    if (!found) {
      const ratioDim = parseRatioDimension(line);
      if (ratioDim) {
        specs.push(buildSpec(ratioDim.width, ratioDim.height, line, specs.length));
        found += 1;
      }
    }
    if (!found) {
      const spaceDim = parseSpaceDimension(line);
      if (spaceDim) {
        specs.push(buildSpec(spaceDim.width, spaceDim.height, line, specs.length));
        found += 1;
      }
    }
    if (!found) {
      unrecognizedLines.push({ lineNumber: lineIndex + 1, text: line, reason: '未识别到尺寸' });
    }
  });

  return { specs, unrecognizedLines };
}
