export type StartupTool = 'toolbox' | 'logo-layout' | 'gif-media' | 'watermark-trace' | 'last';
export type LastTool = Exclude<StartupTool, 'last'>;

export type AppPreferencesV1 = {
  version: 1;
  startupTool: StartupTool;
  lastTool: LastTool;
};

export type AvailableAppTool = 'toolbox' | 'logo-layout';

export const APP_PREFERENCES_STORAGE_KEY = 'brand-material-workbench.app-preferences.v1';
export const DEFAULT_APP_PREFERENCES: AppPreferencesV1 = {
  version: 1,
  startupTool: 'toolbox',
  lastTool: 'toolbox'
};

const STARTUP_TOOLS: StartupTool[] = ['toolbox', 'logo-layout', 'gif-media', 'watermark-trace', 'last'];
const LAST_TOOLS: LastTool[] = ['toolbox', 'logo-layout', 'gif-media', 'watermark-trace'];

function isStartupTool(value: unknown): value is StartupTool {
  return typeof value === 'string' && STARTUP_TOOLS.includes(value as StartupTool);
}

function isLastTool(value: unknown): value is LastTool {
  return typeof value === 'string' && LAST_TOOLS.includes(value as LastTool);
}

export function parseAppPreferences(raw: string | null): AppPreferencesV1 {
  if (!raw) return DEFAULT_APP_PREFERENCES;
  try {
    const candidate = JSON.parse(raw) as Partial<AppPreferencesV1> | null;
    if (!candidate || candidate.version !== 1 || !isStartupTool(candidate.startupTool) || !isLastTool(candidate.lastTool)) {
      return DEFAULT_APP_PREFERENCES;
    }
    return { version: 1, startupTool: candidate.startupTool, lastTool: candidate.lastTool };
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
  return selected === 'logo-layout' ? 'logo-layout' : 'toolbox';
}

export function shouldLaunchGifMediaOnStartup(preferences: AppPreferencesV1): boolean {
  const selected = preferences.startupTool === 'last' ? preferences.lastTool : preferences.startupTool;
  return selected === 'gif-media';
}
