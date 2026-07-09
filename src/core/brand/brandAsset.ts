export type BrandLanguage = 'zh-CN' | 'zh-TW' | 'ja-JP' | 'ko-KR' | 'en-US' | 'custom';

export type BrandAssetType = 'logo' | 'cpr';

export type BrandAsset = {
  id: string;
  type: BrandAssetType;
  name: string;
  language: BrandLanguage;
  svgText: string;
  viewBox?: string;
  viewBoxSize?: {
    width: number;
    height: number;
  };
  aspectRatio?: number;
};

export type BrandLayerState = {
  logoEnabled: boolean;
  cprEnabled: boolean;
  selectedLogoId?: string;
  selectedCprId?: string;
};

export const BRAND_LANGUAGE_OPTIONS: Array<{ value: BrandLanguage; label: string }> = [
  { value: 'zh-CN', label: '简中' },
  { value: 'zh-TW', label: '繁中' },
  { value: 'ja-JP', label: '日文' },
  { value: 'ko-KR', label: '韩文' },
  { value: 'en-US', label: '英文' },
  { value: 'custom', label: '自定义' }
];

const SVG_ROOT_RE = /<svg\b[^>]*>/i;
const VIEW_BOX_RE = /\bviewBox\s*=\s*["']([^"']+)["']/i;
const WIDTH_RE = /\bwidth\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/i;
const HEIGHT_RE = /\bheight\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/i;
const BLOCKED_SVG_RE = /<(?:script|foreignObject)\b/i;
const EXTERNAL_ATTR_RE = /\b(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:\/\/|\/\/|javascript:|data:)/i;
const STYLE_BLOCK_RE = /<style\b[\s\S]*?<\/style>/gi;
const STYLE_IMPORT_RE = /@import\b/i;
const CSS_URL_RE = /url\(\s*["']?([^"')\s]+)["']?\s*\)/gi;

function hasExternalCssReference(cssText: string): boolean {
  if (STYLE_IMPORT_RE.test(cssText)) return true;
  for (const match of cssText.matchAll(CSS_URL_RE)) {
    const value = match[1].trim();
    if (/^(?:https?:\/\/|\/\/|javascript:|data:)/i.test(value)) return true;
  }
  return false;
}

export function getBrandLanguageLabel(language: BrandLanguage): string {
  return BRAND_LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? language;
}

export function parseSvgViewBox(svgText: string): BrandAsset['viewBoxSize'] {
  const root = svgText.match(SVG_ROOT_RE)?.[0];
  if (!root) return undefined;
  const rawViewBox = root.match(VIEW_BOX_RE)?.[1];
  if (rawViewBox) {
    const values = rawViewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number(value));
    if (values.length === 4 && values.every((value) => Number.isFinite(value)) && values[2] > 0 && values[3] > 0) {
      return { width: values[2], height: values[3] };
    }
  }
  const width = Number(root.match(WIDTH_RE)?.[1]);
  const height = Number(root.match(HEIGHT_RE)?.[1]);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }
  return undefined;
}

export function getSvgViewBoxText(svgText: string): string | undefined {
  return svgText.match(SVG_ROOT_RE)?.[0]?.match(VIEW_BOX_RE)?.[1];
}

export function validateBrandSvg(svgText: string): void {
  if (!SVG_ROOT_RE.test(svgText)) {
    throw new Error('文件不是有效 SVG');
  }
  if (BLOCKED_SVG_RE.test(svgText)) {
    throw new Error('暂不支持包含 script 或 foreignObject 的 SVG');
  }
  if (EXTERNAL_ATTR_RE.test(svgText)) {
    throw new Error('暂不支持引用远程资源的 SVG');
  }
  for (const match of svgText.matchAll(STYLE_BLOCK_RE)) {
    if (hasExternalCssReference(match[0])) {
      throw new Error('暂不支持在 SVG 样式中引用外部资源');
    }
  }
}

export function createBrandAsset(input: {
  id: string;
  type: BrandAssetType;
  name: string;
  language: BrandLanguage;
  svgText: string;
}): BrandAsset {
  validateBrandSvg(input.svgText);
  const viewBoxSize = parseSvgViewBox(input.svgText);
  const viewBox = getSvgViewBoxText(input.svgText);
  return {
    ...input,
    viewBox,
    viewBoxSize,
    aspectRatio: viewBoxSize ? viewBoxSize.width / viewBoxSize.height : undefined
  };
}

export function toBrandSvgAsset(asset: BrandAsset) {
  return {
    id: asset.id,
    kind: asset.type,
    label: asset.name,
    language: asset.language,
    svgText: asset.svgText,
    viewBox: asset.viewBoxSize,
    aspectRatio: asset.aspectRatio
  } as const;
}
