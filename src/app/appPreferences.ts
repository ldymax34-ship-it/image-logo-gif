export type StartupTool = 'toolbox' | 'logo-layout' | 'custom' | 'image-compress' | 'gif-media' | 'watermark' | 'video-watermark' | 'gif-compress' | 'batch-template-gif' | 'last';
export type LastTool = Exclude<StartupTool, 'last'>;

export type AppPreferencesV1 = {
  version: 1;
  startupTool: StartupTool;
  lastTool: LastTool;
};

export type AvailableAppTool = 'toolbox' | 'logo-layout' | 'custom' | 'image-compress' | 'gif-compress' | 'batch-template-gif' | 'watermark' | 'video-watermark';

export const APP_PREFERENCES_STORAGE_KEY = 'brand-material-workbench.app-preferences.v1';
export const DEFAULT_APP_PREFERENCES: AppPreferencesV1 = {
  version: 1,
  startupTool: 'toolbox',
  lastTool: 'toolbox'
};

const STARTUP_TOOLS: StartupTool[] = ['toolbox', 'logo-layout', 'custom', 'image-compress', 'gif-media', 'watermark', 'video-watermark', 'gif-compress', 'batch-template-gif', 'last'];
const LAST_TOOLS: LastTool[] = ['toolbox', 'logo-layout', 'custom', 'image-compress', 'gif-media', 'watermark', 'video-watermark', 'gif-compress', 'batch-template-gif'];

// Legacy route name retained for reading old saved preferences only.
const LEGACY_TOOL_MIGRATIONS: Record<string, StartupTool> = {
  'watermark-trace': 'watermark',
  'watermark-video': 'video-watermark',
};

function migrateTool(value: string): string {
  return LEGACY_TOOL_MIGRATIONS[value] ?? value;
}

function isStartupTool(value: unknown): value is StartupTool {
  return typeof value === 'string' && STARTUP_TOOLS.includes(migrateTool(value) as StartupTool);
}

function isLastTool(value: unknown): value is LastTool {
  return typeof value === 'string' && LAST_TOOLS.includes(migrateTool(value) as LastTool);
}

export function parseAppPreferences(raw: string | null): AppPreferencesV1 {
  if (!raw) return DEFAULT_APP_PREFERENCES;
  try {
    const candidate = JSON.parse(raw) as Partial<AppPreferencesV1> | null;
    if (!candidate || candidate.version !== 1 || !isStartupTool(candidate.startupTool) || !isLastTool(candidate.lastTool)) {
      return DEFAULT_APP_PREFERENCES;
    }
    return {
      version: 1,
      startupTool: migrateTool(candidate.startupTool as string) as StartupTool,
      lastTool: migrateTool(candidate.lastTool as string) as LastTool,
    };
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

export function loadAppPreferences(): AppPreferencesV1 {
  if (typeof window === 'undefined') return DEFAULT_APP_PREFERENCES;
  return parseAppPreferences(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY));
}

export function saveAppPreferences(preferences: AppPreferencesV1): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }
}

export function resolveStartupTool(preferences: AppPreferencesV1): AvailableAppTool {
  const selected = preferences.startupTool === 'last' ? preferences.lastTool : preferences.startupTool;
  return selected === 'logo-layout' || selected === 'custom' || selected === 'image-compress' || selected === 'watermark' || selected === 'video-watermark' || selected === 'gif-compress' ? selected : 'toolbox';
}

export function shouldLaunchGifMediaOnStartup(preferences: AppPreferencesV1): boolean {
  const selected = preferences.startupTool === 'last' ? preferences.lastTool : preferences.startupTool;
  return selected === 'gif-media';
}
