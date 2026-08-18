import type { AppTool } from './AppRuntimeProvider';

export type RecentToolEntry = {
  tool: Exclude<AppTool, 'toolbox'>;
  at: number;
};

const RECENT_TOOLS_KEY = 'brand-material-workbench.recent-tools.v1';
const RECENT_TOOL_LIMIT = 6;

const RECENT_TOOL_IDS: Array<Exclude<AppTool, 'toolbox'>> = [
  'logo-layout',
  'watermark',
  'video-watermark'
];

function isRecentTool(value: unknown): value is Exclude<AppTool, 'toolbox'> {
  return typeof value === 'string' && RECENT_TOOL_IDS.includes(value as Exclude<AppTool, 'toolbox'>);
}

export function parseRecentTools(raw: string | null): RecentToolEntry[] {
  if (!raw) return [];
  try {
    const candidate = JSON.parse(raw) as unknown;
    if (!Array.isArray(candidate)) return [];
    const seen = new Set<string>();
    const entries: RecentToolEntry[] = [];
    for (const item of candidate) {
      if (!item || typeof item !== 'object') continue;
      const tool = (item as { tool?: unknown }).tool;
      const at = (item as { at?: unknown }).at;
      if (!isRecentTool(tool) || typeof at !== 'number') continue;
      if (seen.has(tool)) continue;
      seen.add(tool);
      entries.push({ tool, at });
    }
    return entries.slice(0, RECENT_TOOL_LIMIT);
  } catch {
    return [];
  }
}

export function loadRecentTools(): RecentToolEntry[] {
  if (typeof window === 'undefined') return [];
  return parseRecentTools(window.localStorage.getItem(RECENT_TOOLS_KEY));
}

export function saveRecentTools(entries: RecentToolEntry[]): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(entries));
  }
}

export function pushRecentTool(entries: RecentToolEntry[], tool: AppTool): RecentToolEntry[] {
  if (tool === 'toolbox') return entries;
  const next: RecentToolEntry[] = [
    { tool: tool as Exclude<AppTool, 'toolbox'>, at: Date.now() },
    ...entries.filter((entry) => entry.tool !== tool)
  ];
  return next.slice(0, RECENT_TOOL_LIMIT);
}
