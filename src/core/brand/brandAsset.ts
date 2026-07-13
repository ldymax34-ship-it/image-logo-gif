export type BrandLanguage = 'zh-CN' | 'zh-TW' | 'ja-JP' | 'ko-KR' | 'en-US' | 'custom';

export type BrandAssetType = 'logo' | 'cpr';
export type BrandAssetSourceKind = 'svg' | 'image';

export type BrandEffectState = {
  colorEnabled: boolean;
  color: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  glowEnabled: boolean;
  glowColor: string;
  glowBlur: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
};

export type BrandAsset = {
  id: string;
  type: BrandAssetType;
  sourceKind: BrandAssetSourceKind;
  name: string;
  language: BrandLanguage;
  svgText?: string;
  sourceUrl?: string;
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
  logoLanguage: BrandLanguage;
  cprLanguage: BrandLanguage;
  selectedLogoId?: string;
  selectedCprId?: string;
  logoAnchor: 'top-left' | 'top-right' | 'center';
  cprAnchor: 'top-left' | 'top-right' | 'center';
  logoSize: 'small' | 'standard' | 'large';
  cprSize: 'small' | 'standard' | 'large';
  logoEffect: BrandEffectState;
  cprEffect: BrandEffectState;
  /** Brand System fields. Legacy anchors stay readable for saved local state. */
  logoGroup?: import('./brandTypes').LogoGroupState;
  cprFollowsLogoGroup?: boolean;
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
    sourceKind: 'svg',
    viewBox,
    viewBoxSize,
    aspectRatio: viewBoxSize ? viewBoxSize.width / viewBoxSize.height : undefined
  };
}

export function createRasterBrandAsset(input: {
  id: string;
  type: BrandAssetType;
  name: string;
  language: BrandLanguage;
  sourceUrl: string;
  width: number;
  height: number;
}): BrandAsset {
  return {
    id: input.id,
    type: input.type,
    sourceKind: 'image',
    name: input.name,
    language: input.language,
    sourceUrl: input.sourceUrl,
    viewBoxSize: {
      width: input.width,
      height: input.height
    },
    aspectRatio: input.width / input.height
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

export const DEFAULT_LOGO_EFFECT: BrandEffectState = {
  colorEnabled: false,
  color: '#ffffff',
  strokeEnabled: false,
  strokeColor: '#000000',
  strokeWidth: 1,
  glowEnabled: false,
  glowColor: '#ffffff',
  glowBlur: 8,
  shadowEnabled: false,
  shadowColor: '#000000',
  shadowOpacity: 0.45,
  shadowBlur: 10,
  shadowOffsetX: 0,
  shadowOffsetY: 5
};

export const DEFAULT_CPR_EFFECT: BrandEffectState = {
  ...DEFAULT_LOGO_EFFECT,
  colorEnabled: true,
  color: '#ffffff'
};

export const DEFAULT_BRAND_ASSETS: BrandAsset[] = [
  createRasterBrandAsset({
    id: 'preset_kuro_cpr_rights',
    type: 'cpr',
    name: 'KURO Rights CPR',
    language: 'custom',
    sourceUrl: '/brand-cpr/kuro-rights.svg',
    width: 1669,
    height: 109
  }),
  createRasterBrandAsset({
    id: 'preset_kuro_en_black',
    type: 'logo',
    name: 'KURO 英文标识 黑色',
    language: 'custom',
    sourceUrl: '/brand-logos/company/kuro-en-black.png',
    width: 7500,
    height: 750
  }),
  createRasterBrandAsset({
    id: 'preset_kuro_en_white',
    type: 'logo',
    name: 'KURO 英文标识 白色',
    language: 'custom',
    sourceUrl: '/brand-logos/company/kuro-en-white.png',
    width: 7500,
    height: 750
  }),
  createRasterBrandAsset({
    id: 'preset_ww_zh_cn',
    type: 'logo',
    name: '鸣潮 Logo 简中',
    language: 'zh-CN',
    sourceUrl: '/brand-logos/wuthering-waves/ww-zh-cn.png',
    width: 1333,
    height: 872
  }),
  createRasterBrandAsset({
    id: 'preset_ww_zh_tw_ja',
    type: 'logo',
    name: '鸣潮 Logo 繁中 / 日文',
    language: 'zh-TW',
    sourceUrl: '/brand-logos/wuthering-waves/ww-zh-tw-ja.png',
    width: 1332,
    height: 872
  }),
  createRasterBrandAsset({
    id: 'preset_ww_ja',
    type: 'logo',
    name: '鸣潮 Logo 日文',
    language: 'ja-JP',
    sourceUrl: '/brand-logos/wuthering-waves/ww-zh-tw-ja.png',
    width: 1332,
    height: 872
  }),
  createRasterBrandAsset({
    id: 'preset_ww_en',
    type: 'logo',
    name: '鸣潮 Logo 英文',
    language: 'en-US',
    sourceUrl: '/brand-logos/wuthering-waves/ww-en.png',
    width: 1820,
    height: 593
  }),
  createRasterBrandAsset({
    id: 'preset_ww_ko',
    type: 'logo',
    name: '鸣潮 Logo 韩文',
    language: 'ko-KR',
    sourceUrl: '/brand-logos/wuthering-waves/ww-ko.png',
    width: 1325,
    height: 872
  })
];
