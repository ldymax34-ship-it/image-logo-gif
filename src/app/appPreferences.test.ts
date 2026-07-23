import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_PREFERENCES,
  parseAppPreferences,
  resolveStartupTool
} from './appPreferences';

describe('app preferences', () => {
  it('falls back to the toolbox for missing, corrupt, unknown-version, and unknown-tool records', () => {
    expect(parseAppPreferences(null)).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences('{')).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences(JSON.stringify({ version: 2, startupTool: 'logo-layout', lastTool: 'logo-layout' }))).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences(JSON.stringify({ version: 1, startupTool: 'unknown', lastTool: 'toolbox' }))).toEqual(DEFAULT_APP_PREFERENCES);
  });

  it('resolves direct and last startup tools without restoring work content', () => {
    expect(resolveStartupTool({ version: 1, startupTool: 'toolbox', lastTool: 'logo-layout' })).toBe('toolbox');
    expect(resolveStartupTool({ version: 1, startupTool: 'logo-layout', lastTool: 'toolbox' })).toBe('logo-layout');
    expect(resolveStartupTool({ version: 1, startupTool: 'last', lastTool: 'logo-layout' })).toBe('logo-layout');
  });

  it('safely returns unavailable startup and last tools to the toolbox', () => {
    expect(resolveStartupTool({ version: 1, startupTool: 'gif-media', lastTool: 'logo-layout' })).toBe('toolbox');
    expect(resolveStartupTool({ version: 1, startupTool: 'watermark-trace', lastTool: 'toolbox' })).toBe('toolbox');
    expect(resolveStartupTool({ version: 1, startupTool: 'last', lastTool: 'gif-media' })).toBe('toolbox');
    expect(resolveStartupTool({ version: 1, startupTool: 'last', lastTool: 'watermark-trace' })).toBe('toolbox');
  });
});
