import { createApp } from 'vue';
import GifTool from './GifTool.vue';
import './gifTool.css';

export function createGifToolApp() {
  return createApp(GifTool);
}

// Standalone mount (for backwards compat / dev)
if (typeof document !== 'undefined' && document.getElementById('gif-tool-root')) {
  createGifToolApp().mount('#gif-tool-root');
}
