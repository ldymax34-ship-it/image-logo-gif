import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_PREFERENCES,
  parseAppPreferences,
  resolveStartupTool,
  shouldLaunchGifMediaOnStartup
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

  it('migrates legacy watermark route names to the separate image/video tools', () => {
    expect(parseAppPreferences(JSON.stringify({ version: 1, startupTool: 'watermark-trace', lastTool: 'watermark-video' })))
      .toEqual({ version: 1, startupTool: 'watermark', lastTool: 'video-watermark' });
    expect(resolveStartupTool({ version: 1, startupTool: 'video-watermark', lastTool: 'toolbox' })).toBe('video-watermark');
  });

  it('accepts the independent 自定义构图 startup entry and still rejects retired tools', () => {
    expect(resolveStartupTool({ version: 1, startupTool: 'custom', lastTool: 'toolbox' })).toBe('custom');
    expect(resolveStartupTool({ version: 1, startupTool: 'last', lastTool: 'custom' })).toBe('custom');
    expect(resolveStartupTool({ version: 1, startupTool: 'gif-compress', lastTool: 'toolbox' })).toBe('toolbox');
    expect(parseAppPreferences(JSON.stringify({ version: 1, startupTool: 'custom', lastTool: 'custom' })))
      .toEqual({ version: 1, startupTool: 'custom', lastTool: 'custom' });
  });

  it('launches the GIF window separately while the watermark tool is now a valid startup choice', () => {
    expect(resolveStartupTool({ version: 1, startupTool: 'gif-media', lastTool: 'logo-layout' })).toBe('toolbox');
    expect(resolveStartupTool({ version: 1, startupTool: 'watermark', lastTool: 'toolbox' })).toBe('watermark');
    expect(resolveStartupTool({ version: 1, startupTool: 'video-watermark', lastTool: 'toolbox' })).toBe('video-watermark');
    expect(resolveStartupTool({ version: 1, startupTool: 'last', lastTool: 'gif-media' })).toBe('toolbox');
    expect(resolveStartupTool({ version: 1, startupTool: 'last', lastTool: 'watermark' })).toBe('watermark');
    expect(shouldLaunchGifMediaOnStartup({ version: 1, startupTool: 'gif-media', lastTool: 'toolbox' })).toBe(true);
    expect(shouldLaunchGifMediaOnStartup({ version: 1, startupTool: 'last', lastTool: 'gif-media' })).toBe(true);
    expect(shouldLaunchGifMediaOnStartup({ version: 1, startupTool: 'watermark', lastTool: 'toolbox' })).toBe(false);
  });
});
