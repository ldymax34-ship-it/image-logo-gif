import { describe, expect, it } from 'vitest';
import { buildMacCandidateManifest } from './create-mac-candidate-manifest.mjs';

describe('macOS candidate manifest', () => {
  it('contains only the signed Apple Silicon updater candidate', () => {
    const result = buildMacCandidateManifest({
      version: '0.1.30',
      notes: 'candidate',
      pubDate: '2026-07-22T00:00:00.000Z',
      macUrl: 'https://example.com/macos.tar.gz',
      macSignature: 'mac-signature\n'
    });
    expect(Object.keys(result.platforms)).toEqual(['darwin-aarch64']);
    expect(result.platforms['darwin-aarch64'].signature).toBe('mac-signature');
  });

  it('rejects a signature URL', () => {
    expect(() => buildMacCandidateManifest({
      version: '0.1.30',
      notes: 'candidate',
      pubDate: '2026-07-22T00:00:00.000Z',
      macUrl: 'https://example.com/macos.tar.gz',
      macSignature: 'https://example.com/macos.sig'
    })).toThrow(/signature content/);
  });
});
