import type { PresetTemplate } from '../spec/presetTemplates';
import { DEFAULT_BRAND_SETTINGS, type BrandSettingsV1 } from '../brand';

const CUSTOM_PRESET_STORAGE_KEY = 'brand-material-workbench.custom-presets.v1';
const BRAND_SETTINGS_STORAGE_KEY = 'brand-material-workbench.brand-settings.v1';

function isPresetTemplate(value: unknown): value is PresetTemplate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as PresetTemplate;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    Array.isArray(candidate.specs)
  );
}

export function loadCustomPresetTemplates(): PresetTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPresetTemplate);
  } catch {
    return [];
  }
}

export function saveCustomPresetTemplates(templates: PresetTemplate[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CUSTOM_PRESET_STORAGE_KEY, JSON.stringify(templates));
}

export function loadBrandSettings(): BrandSettingsV1 {
  if (typeof window === 'undefined') return DEFAULT_BRAND_SETTINGS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BRAND_SETTINGS_STORAGE_KEY) ?? 'null') as Partial<BrandSettingsV1> | null;
    if (!parsed || parsed.version !== 1) return DEFAULT_BRAND_SETTINGS;
    return { ...DEFAULT_BRAND_SETTINGS, ...parsed, defaultPlacementByAspect: { ...DEFAULT_BRAND_SETTINGS.defaultPlacementByAspect, ...parsed.defaultPlacementByAspect } };
  } catch { return DEFAULT_BRAND_SETTINGS; }
}

export function saveBrandSettings(settings: BrandSettingsV1): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(BRAND_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function resetBrandSettings(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(BRAND_SETTINGS_STORAGE_KEY);
}
