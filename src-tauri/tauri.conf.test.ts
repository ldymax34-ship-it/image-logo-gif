import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(new URL('./tauri.conf.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(
  readFileSync(new URL('./capabilities/default.json', import.meta.url), 'utf8'),
);

describe('Tauri asset protocol contract', () => {
  it('enables asset URLs without granting a broad static filesystem scope', () => {
    expect(config.app.security.assetProtocol).toEqual({ enable: true, scope: [] });
  });

  it('limits the desktop opener to path opening and file reveal commands', () => {
    expect(capabilities.permissions).toContain('opener:allow-open-path');
    expect(capabilities.permissions).toContain('opener:allow-reveal-item-in-dir');
    expect(capabilities.permissions).not.toContain('opener:default');
    expect(capabilities.permissions).not.toContain('opener:allow-open-url');
  });
});
