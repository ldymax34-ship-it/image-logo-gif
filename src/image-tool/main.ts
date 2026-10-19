import { createApp } from 'vue';
import ImageTool from './ImageTool.vue';
import './imageTool.css';

export function createImageToolApp() {
  return createApp(ImageTool);
}

// Standalone mount (for backwards compat / dev)
if (typeof document !== 'undefined' && document.getElementById('image-tool-root')) {
  createImageToolApp().mount('#image-tool-root');
}
