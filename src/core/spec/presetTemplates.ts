import type { MaterialSpec } from './specParser';

export type PresetTemplate = {
  id: string;
  name: string;
  description: string;
  specs: Omit<MaterialSpec, 'id'>[];
};

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'social-common',
    name: '常用社媒',
    description: '覆盖方图、横版、竖版三个基础版型。',
    specs: [
      { name: '1080x1080', width: 1080, height: 1080, format: 'jpg' },
      { name: '1080x1920', width: 1080, height: 1920, format: 'jpg' },
      { name: '1920x1080', width: 1920, height: 1080, format: 'jpg' }
    ]
  },
  {
    id: 'wide-campaign',
    name: '横版投放',
    description: '用于官网 banner、横版广告和视频封面。',
    specs: [
      { name: '1920x1080', width: 1920, height: 1080, format: 'jpg' },
      { name: '2560x1097', width: 2560, height: 1097, format: 'jpg' },
      { name: '1600x1200', width: 1600, height: 1200, format: 'jpg' }
    ]
  }
];

export function toPresetSpecs(specs: MaterialSpec[]): Omit<MaterialSpec, 'id'>[] {
  return specs.map(({ id: _id, ...spec }) => ({ ...spec }));
}

export function serializePresetSpecs(specs: Array<Omit<MaterialSpec, 'id'>>): string {
  return specs
    .map((spec) => {
      const dimensions = `${spec.width}x${spec.height}`;
      if (spec.name === dimensions && spec.format === 'jpg' && !spec.maxSizeKb) return dimensions;
      const sizeLimit = spec.maxSizeKb ? ` ${spec.maxSizeKb >= 1024 ? `${(spec.maxSizeKb / 1024).toFixed(spec.maxSizeKb % 1024 === 0 ? 0 : 1)}MB` : `${spec.maxSizeKb}KB`}` : '';
      return `${spec.name} ${dimensions} ${spec.format}${sizeLimit}`.trim();
    })
    .join('\n');
}
