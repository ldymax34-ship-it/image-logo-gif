import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(new URL('./tauri.conf.json', import.meta.url), 'utf8'));

describe('Tauri asset protocol contract', () => {
  it('enables asset URLs without granting a broad static filesystem scope', () => {
    expect(config.app.security.assetProtocol).toEqual({ enable: true, scope: [] });
  });
});
