import { describe, expect, it } from 'vitest';
import { buildExportJobs, EXPORT_LANGUAGES } from './exportJob';
import { createDefaultCprState, createDefaultLogoGroup, DEFAULT_BRAND_LAYER, DEFAULT_BRAND_SETTINGS, type BoardBrandStateMap, type BoardPreviewState, type LogoGroupMode, type MaterialAsset, type MaterialSpec } from '../../core';

const assetA: MaterialAsset = { id: 'a', fileName: 'hero_ja.png', objectUrl: 'blob:a', width: 1000, height: 1000, fileSize: 1000, mimeType: 'image/png' };
const assetB: MaterialAsset = { id: 'b', fileName: 'hero_ko.png', objectUrl: 'blob:b', width: 1000, height: 1000, fileSize: 1000, mimeType: 'image/png' };
const spec300: MaterialSpec = { id: 's300', name: '300x300', width: 300, height: 300, format: 'png' };
const spec600: MaterialSpec = { id: 's600', name: '600x600', width: 600, height: 600, format: 'png' };

const brandAssets = [
  { id: 'logo-zh', type: 'logo' as const, sourceKind: 'image' as const, name: 'zh', language: 'zh-CN' as const },
  { id: 'logo-ja', type: 'logo' as const, sourceKind: 'image' as const, name: 'ja', language: 'ja-JP' as const },
  { id: 'logo-ko', type: 'logo' as const, sourceKind: 'image' as const, name: 'ko', language: 'ko-KR' as const },
  { id: 'logo-en', type: 'logo' as const, sourceKind: 'image' as const, name: 'en', language: 'en-US' as const },
  { id: 'cpr', type: 'cpr' as const, sourceKind: 'svg' as const, name: 'cpr', language: 'custom' as const }
];

function makeBoard(language:  'zh-CN' | 'ja-JP' | 'ko-KR' = 'zh-CN', logoMode: LogoGroupMode = 'game-only'): ReturnType<typeof createDefaultLogoGroup> {
  return { ...createDefaultLogoGroup(language), mode: logoMode, gameLogoLanguage: language };
}

function brandMap(languages: Record<string, 'zh-CN' | 'ja-JP' | 'ko-KR'>): BoardBrandStateMap {
  return Object.fromEntries(Object.entries(languages).map(([key, language]) => [key, { logo: makeBoard(language), cpr: createDefaultCprState() }]));
}

function previewMap(specs: MaterialSpec[]): Record<string, BoardPreviewState> {
  return Object.fromEntries(specs.map((spec) => [`a:${spec.id}`, { assetId: 'a', specId: spec.id, fitMode: 'cover', crop: { scale: 1, offsetX: 0, offsetY: 0 } }]));
}

describe('buildExportJobs per-board language', () => {
  it('default export uses each board saved language', () => {
    const specs = [spec300, spec600];
    const map = brandMap({ 'a:s300': 'ja-JP', 'a:s600': 'zh-CN' });
    const jobs = buildExportJobs({
      assets: [assetA],
      specs,
      previewStates: previewMap(specs),
      boardBrandStates: map,
      brandAssets,
      brandLayer: { ...DEFAULT_BRAND_LAYER, selectedCprId: 'cpr' },
      brandSettings: DEFAULT_BRAND_SETTINGS,
      format: 'png',
      quality: 0.9,
      sizePolicy: { mode: 'unlimited' },
      languageMode: 'default',
      namingMode: 'source-name'
    });
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.requestedLanguage)).toEqual(['ja-JP', 'zh-CN']);
    expect(jobs.every((job) => !job.missing)).toBe(true);
  });

  it('keeps each asset language separate across same specs', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'ja-JP', 'b:s300': 'ko-KR' });
    const previews = { ...previewMap(specs), 'b:s300': { assetId: 'b', specId: 's300', fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } } };
    const jobs = buildExportJobs({ assets: [assetA, assetB], specs, previewStates: previews, boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'default', namingMode: 'source-name' });
    expect(jobs.map((job) => `${job.assetId}:${job.requestedLanguage}`)).toEqual(['a:ja-JP', 'b:ko-KR']);
  });

  it('append mode deduplicates the board language', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'ja-JP' });
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'append', additionalLanguages: ['ja-JP', 'en-US'], namingMode: 'source-name' });
    expect(jobs.map((job) => job.requestedLanguage)).toEqual(['ja-JP', 'en-US']);
  });

  it('all mode expands every supported language per board', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'ja-JP' });
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'all', namingMode: 'source-name' });
    expect(jobs.map((job) => job.requestedLanguage)).toEqual(EXPORT_LANGUAGES);
  });

  it('marks jobs missing when the requested language asset is unavailable', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'de-DE' as 'zh-CN' });
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets: brandAssets.filter((asset) => asset.type === 'cpr'), brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'default', namingMode: 'source-name' });
    expect(jobs[0].missing).toBe(true);
    expect(jobs[0].missingReason).toContain('Logo');
  });

  it('does not fake a language code for company-only mode', () => {
    const specs = [spec300];
    const map = { 'a:s300': { logo: makeBoard('zh-CN', 'company-only'), cpr: createDefaultCprState() } };
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'default', namingMode: 'source-name' });
    expect(jobs[0].plannedFileName).toBe('hero_ja_300x300.png');
  });

  it('uses custom name instead of source name', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'ja-JP' });
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'default', namingMode: 'custom-name', customNameByAsset: { a: 'kv_release' } });
    expect(jobs[0].plannedFileName).toBe('kv_release_ja_300x300.png');
  });

  it('freezes snapshots so later state changes cannot mutate the job', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'ja-JP' });
    const previews = previewMap(specs);
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previews, boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'default', namingMode: 'source-name' });
    previews['a:s300'].crop.scale = 5;
    expect(jobs[0].previewSnapshot.crop.scale).toBe(1);
  });
});

describe('buildExportJobs naming disambiguation', () => {
  it('does not append source name when multi-asset custom names are different', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'ja-JP', 'b:s300': 'ko-KR' });
    const previews = { ...previewMap(specs), 'b:s300': { assetId: 'b', specId: 's300', fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } } };
    const jobs = buildExportJobs({ assets: [assetA, assetB], specs, previewStates: previews, boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'default', namingMode: 'custom-name', customNameByAsset: { a: 'alpha', b: 'beta' } });
    expect(jobs.find((j) => j.assetId === 'a')!.plannedFileName).toBe('alpha_ja_300x300.png');
    expect(jobs.find((j) => j.assetId === 'b')!.plannedFileName).toBe('beta_ko_300x300.png');
  });

  it('adds deterministic _2 disambiguation when custom names collide', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'ja-JP', 'b:s300': 'ja-JP' });
    const previews = { ...previewMap(specs), 'b:s300': { assetId: 'b', specId: 's300', fitMode: 'cover' as const, crop: { scale: 1, offsetX: 0, offsetY: 0 } } };
    const jobs = buildExportJobs({ assets: [assetA, assetB], specs, previewStates: previews, boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'default', namingMode: 'custom-name', customNameByAsset: { a: 'shared', b: 'shared' } });
    const names = jobs.map((j) => j.plannedFileName).sort();
    expect(names).toEqual(['shared_ja_300x300.png', 'shared_ja_300x300_2.png']);
  });
});

describe('buildExportJobs language collapse', () => {
  it('collapses to a single task when logo is disabled in all mode', () => {
    const specs = [spec300];
    const map = { 'a:s300': { logo: makeBoard('ja-JP'), cpr: createDefaultCprState(), logoEnabled: false } };
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'all', namingMode: 'source-name' });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].requestedLanguage).toBe('ja-JP');
  });

  it('collapses to a single task for company-only in all mode', () => {
    const specs = [spec300];
    const map = { 'a:s300': { logo: makeBoard('zh-CN', 'company-only'), cpr: createDefaultCprState() } };
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'all', namingMode: 'source-name' });
    expect(jobs).toHaveLength(1);
  });

  it('collapses to a single task for company-only in append mode', () => {
    const specs = [spec300];
    const map = { 'a:s300': { logo: makeBoard('zh-CN', 'company-only'), cpr: createDefaultCprState() } };
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'append', additionalLanguages: ['en-US', 'ja-JP'], namingMode: 'source-name' });
    expect(jobs).toHaveLength(1);
  });

  it('does not include a language code in the file name when logo is disabled', () => {
    const specs = [spec300];
    const map = { 'a:s300': { logo: makeBoard('zh-CN'), cpr: createDefaultCprState(), logoEnabled: false } };
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'append', additionalLanguages: ['en-US'], namingMode: 'source-name' });
    // hero_ja is the source name; no separate language segment
    expect(jobs[0].plannedFileName).toBe('hero_ja_300x300.png');
  });
});

describe('ExportJob immutability', () => {
  it('does not have an actualFileName field on the job', () => {
    const specs = [spec300];
    const map = brandMap({ 'a:s300': 'ja-JP' });
    const jobs = buildExportJobs({ assets: [assetA], specs, previewStates: previewMap(specs), boardBrandStates: map, brandAssets, brandLayer: DEFAULT_BRAND_LAYER, brandSettings: DEFAULT_BRAND_SETTINGS, format: 'png', quality: 0.9, sizePolicy: { mode: 'unlimited' }, languageMode: 'default', namingMode: 'source-name' });
    expect(jobs[0]).not.toHaveProperty('actualFileName');
  });
});
