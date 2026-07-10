import type { PresetTemplate } from '../spec/presetTemplates';

const CUSTOM_PRESET_STORAGE_KEY = 'brand-material-workbench.custom-presets.v1';

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
