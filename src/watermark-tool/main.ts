import { createApp } from 'vue';
import WatermarkTool from './WatermarkTool.vue';
import './watermarkTool.css';

export function createWatermarkToolApp() {
  return createApp(WatermarkTool);
}

// Standalone mount (for backwards compat / dev)
if (typeof document !== 'undefined' && document.getElementById('watermark-tool-root')) {
  createWatermarkToolApp().mount('#watermark-tool-root');
}
