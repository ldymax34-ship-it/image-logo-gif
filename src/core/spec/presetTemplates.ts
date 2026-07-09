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
      { name: '方图_1080', width: 1080, height: 1080, format: 'jpg', maxSizeKb: 1000 },
      { name: '竖版_1080x1920', width: 1080, height: 1920, format: 'jpg', maxSizeKb: 1200 },
      { name: '横版_1920x1080', width: 1920, height: 1080, format: 'jpg', maxSizeKb: 1500 }
    ]
  },
  {
    id: 'wide-campaign',
    name: '横版投放',
    description: '用于官网 banner、横版广告和视频封面。',
    specs: [
      { name: '16_9_1920', width: 1920, height: 1080, format: 'jpg', maxSizeKb: 1500 },
      { name: '21_9_2560', width: 2560, height: 1097, format: 'jpg', maxSizeKb: 1800 },
      { name: '4_3_1600', width: 1600, height: 1200, format: 'jpg', maxSizeKb: 1500 }
    ]
  }
];
