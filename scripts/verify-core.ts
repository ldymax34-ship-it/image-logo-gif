import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildOutputFileName,
  classifyAspect,
  computeFitRect,
  DEFAULT_BRAND_ASSETS,
  createBrandAsset,
  createInitialCropState,
  getBoardPreviewKey,
  parseSpecText,
  renderBrandLayer,
  sanitizeFileNamePart
} from '../src/core';

const appActivitySource = readFileSync(fileURLToPath(new URL('../src/app/appActivity.ts', import.meta.url)), 'utf8');
const appActivityLines = appActivitySource.split(/\r?\n/);
const firstRuntimeLine = appActivityLines.findIndex((line) => {
  const trimmed = line.trim();
  return trimmed !== '' && !trimmed.startsWith('import ');
});
assert.ok(firstRuntimeLine >= 0, 'appActivity should contain runtime declarations');
assert.equal(
  appActivityLines.findIndex((line) => line.includes("from 'react'")),
  0,
  'React imports must be initialized before appActivity runtime declarations'
);
assert.equal(
  appActivityLines.slice(firstRuntimeLine).some((line) => line.trim().startsWith('import ')),
  false,
  'appActivity must not declare imports after runtime declarations'
);

const parsed = parseSpecText(`
1080x1920 jpg 1200KB
1920*1080 png 2MB
3840×2160
900 383
1:1 1024
16:9 1920
9:16 1080
这行没有尺寸
`);

assert.equal(parsed.specs.length, 7, 'should parse seven specs');
assert.equal(parsed.unrecognizedLines.length, 1, 'should keep one unrecognized line');
assert.deepEqual(
  parsed.specs.map((spec) => `${spec.width}x${spec.height}`),
  ['1080x1920', '1920x1080', '3840x2160', '900x383', '1024x1024', '1920x1080', '1080x1920']
);
assert.equal(parsed.specs[1].format, 'png');
assert.equal(parsed.specs[1].maxSizeKb, 2048);

assert.equal(classifyAspect({ width: 2560, height: 1097 }), 'landscape');
assert.equal(classifyAspect({ width: 1080, height: 1080 }), 'square');
assert.equal(classifyAspect({ width: 1080, height: 1920 }), 'portrait');

const brand = renderBrandLayer({
  canvas: { width: 1920, height: 1080 },
  includeLogo: true,
  includeCpr: true,
  logoAsset: { id: 'logo', kind: 'logo', label: 'Logo', viewBox: { width: 420, height: 120 } },
  cprAsset: { id: 'cpr', kind: 'cpr', label: 'CPR', viewBox: { width: 520, height: 96 } },
  logoAnchor: 'top-right',
  cprAnchor: 'center'
});

assert.equal(brand.layers.length, 2);
assert.ok(brand.layers[0].layout.rect.x > 0, 'logo should be placed inside canvas');
assert.ok(brand.layers[1].layout.rect.width > 0, 'cpr width should be computed');

assert.equal(sanitizeFileNamePart('CON'), '_CON');
assert.equal(sanitizeFileNamePart('中文/文件:名*测试'), '中文_文件_名_测试');
assert.match(buildOutputFileName(parsed.specs[0], { batchName: '批次A', sourceName: '主视觉', index: 0, includeIndex: true, includeSpecName: true }), /^01_批次A_主视觉_/);

const cover = computeFitRect({ width: 1000, height: 500 }, { width: 300, height: 300 }, 'cover');
assert.equal(cover.width, 600);
assert.equal(cover.height, 300);
assert.equal(getBoardPreviewKey('asset', 'spec'), 'asset:spec');
const crop = createInitialCropState({ width: 1000, height: 500 }, { width: 300, height: 300 }, 'cover');
assert.equal(crop.scale, 0.6);

const svgAsset = createBrandAsset({
  id: 'logo',
  type: 'logo',
  name: 'logo.svg',
  language: 'zh-CN',
  svgText: '<svg viewBox="0 0 420 120" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>'
});
assert.equal(svgAsset.aspectRatio, 3.5);
assert.ok(DEFAULT_BRAND_ASSETS.some((asset) => asset.sourceUrl === '/brand-logos/company/kuro-en-white.png'));
assert.ok(DEFAULT_BRAND_ASSETS.some((asset) => asset.sourceUrl === '/brand-logos/wuthering-waves/ww-en.png'));
assert.throws(
  () =>
    createBrandAsset({
      id: 'remote',
      type: 'logo',
      name: 'remote.svg',
      language: 'en-US',
      svgText: '<svg viewBox="0 0 1 1"><use href="//example.com/icon.svg#x"/></svg>'
    }),
  /远程资源/
);

console.log('verify-core: OK');
