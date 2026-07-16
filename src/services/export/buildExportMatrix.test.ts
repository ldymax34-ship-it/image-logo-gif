import { describe, expect, it } from 'vitest';
import { buildExportMatrix, buildExportMatrixForLanguages, getSelectedExportLanguages } from './buildExportMatrix';

const assets = [{ id: 'a', fileName: 'a.png', objectUrl: 'blob:a', width: 10, height: 10, fileSize: 10, mimeType: 'image/png' }, { id: 'b', fileName: 'b.png', objectUrl: 'blob:b', width: 10, height: 10, fileSize: 10, mimeType: 'image/png' }];
const specs = [{ id: 'one', name: 'one', width: 10, height: 10, format: 'png' as const }, { id: 'two', name: 'two', width: 20, height: 20, format: 'jpg' as const }];

describe('buildExportMatrix language behavior', () => {
  it('keeps one row per asset and board in single-language mode', () => { expect(buildExportMatrix(assets, specs, false)).toHaveLength(4); });
  it('keeps exactly five languages per asset and board', () => { expect(buildExportMatrix(assets, specs, true)).toHaveLength(20); });

  it('keeps the base language once and adds only the explicitly selected languages', () => {
    expect(getSelectedExportLanguages({ baseLanguage: 'zh-CN', additionalLanguages: ['zh-CN', 'en-US', 'ja-JP'] })).toEqual(['zh-CN', 'en-US', 'ja-JP']);
    expect(buildExportMatrixForLanguages(assets, specs, { baseLanguage: 'zh-CN', additionalLanguages: ['en-US'] })).toHaveLength(8);
  });
});
