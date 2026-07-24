<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { closeGifMediaPreview } from '../app/gifMediaLauncher';
import { isMediaDesktopAvailable, loadMediaDesktopApi, type MediaDesktopApi } from './mediaDesktop';
import {
  applyMediaPreset,
  applyMediaTaskEvent,
  createMediaTask,
  DEFAULT_GIF_MEDIA_OPTIONS,
  DEFAULT_WATERMARK_OPTIONS,
  formatFileSize,
  MEDIA_PRESETS,
  mediaTaskKindLabel,
  type GifMediaOptions,
  type GifMediaTask,
  type MediaEngineStatus,
  type MediaPreset,
  type MediaTaskEvent,
  type WatermarkOptions
} from './mediaTypes';

// Source note: queue interaction semantics are adapted from FFUI
// 4122222415bc209c711c7c166fc78d2d6d1dc139. This uses only current-app Tauri
// commands and bundled sidecars; no FFUI backend source is imported.
const desktop = isMediaDesktopAvailable();
const mode = ref<'gif' | 'watermark'>(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'watermark' ? 'watermark' : 'gif');
const tasks = ref<GifMediaTask[]>([]);
const api = ref<MediaDesktopApi>();
const engine = ref<MediaEngineStatus>({ ready: false, message: desktop ? '正在检查内置转换引擎…' : '真实转换仅桌面可用。' });
const options = ref<GifMediaOptions>({ ...DEFAULT_GIF_MEDIA_OPTIONS, outputDirectory: '' });
const watermarkOptions = ref<WatermarkOptions>({ ...DEFAULT_WATERMARK_OPTIONS, outputDirectory: '' });
const message = ref('');
const activeTaskId = ref<string>();
let unlistenTaskEvents: (() => void) | undefined;
let unlistenDroppedPaths: (() => void) | undefined;
let unlistenMode: (() => void) | undefined;

const activeOptions = computed(() => mode.value === 'gif' ? options.value : watermarkOptions.value);
const canStart = computed(() => desktop && engine.value.ready && Boolean(activeOptions.value.outputDirectory) && tasks.value.some((task) => task.status === 'waiting') && !activeTaskId.value);
const runningTask = computed(() => tasks.value.find((task) => task.id === activeTaskId.value));

function updateTasks(event: MediaTaskEvent) {
  tasks.value = applyMediaTaskEvent(tasks.value, event);
}

function normalizedOptions(): GifMediaOptions {
  const finiteOrUndefined = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return { ...options.value, startSeconds: finiteOrUndefined(options.value.startSeconds), endSeconds: finiteOrUndefined(options.value.endSeconds), width: finiteOrUndefined(options.value.width) };
}

function normalizedWatermarkOptions(): WatermarkOptions {
  const sizePercent = Number(watermarkOptions.value.sizePercent);
  const opacity = Number(watermarkOptions.value.opacity);
  return {
    ...watermarkOptions.value,
    sizePercent: Number.isFinite(sizePercent) ? sizePercent : DEFAULT_WATERMARK_OPTIONS.sizePercent,
    opacity: Number.isFinite(opacity) ? opacity : DEFAULT_WATERMARK_OPTIONS.opacity
  };
}

function appendPaths(paths: string[]) {
  const existing = new Set(tasks.value.map((task) => task.inputPath));
  const supported = mode.value === 'gif' ? /\.(mp4|mov)$/i : /\.(png|jpe?g|webp|gif|mp4|mov)$/i;
  const incoming = paths.filter((path) => supported.test(path) && !existing.has(path));
  if (!incoming.length) {
    message.value = mode.value === 'gif' ? '请选择 MP4 或 MOV 文件；重复文件不会重复加入队列。' : '请选择 PNG、JPG、WebP、GIF、MP4 或 MOV；重复文件不会重复加入队列。';
    return;
  }
  const taskOptions = mode.value === 'gif' ? normalizedOptions() : normalizedWatermarkOptions();
  tasks.value = [...tasks.value, ...incoming.map((path, index) => createMediaTask(path, tasks.value.length + index, mode.value, taskOptions))];
  message.value = '';
}

async function chooseMediaFiles() {
  if (!api.value) return;
  appendPaths(mode.value === 'gif' ? await api.value.pickMediaFiles() : await api.value.pickWatermarkFiles());
}

async function chooseOutputDirectory() {
  if (!api.value) return;
  const directory = await api.value.pickOutputDirectory();
  if (!directory) return;
  if (mode.value === 'gif') options.value = { ...options.value, outputDirectory: directory };
  else watermarkOptions.value = { ...watermarkOptions.value, outputDirectory: directory };
}

async function chooseWatermarkImage() {
  if (!api.value) return;
  const imagePath = await api.value.pickWatermarkImage();
  if (imagePath) watermarkOptions.value = { ...watermarkOptions.value, imagePath };
}

function applyPreset(preset: MediaPreset) {
  options.value = applyMediaPreset(options.value, preset);
}

function switchMode(nextMode: 'gif' | 'watermark') {
  if (activeTaskId.value) return;
  mode.value = nextMode;
  tasks.value = [];
  message.value = '';
  window.history.replaceState(null, '', nextMode === 'watermark' ? '?mode=watermark' : '/gif-media.html');
}

async function startNextTask() {
  if (!api.value || activeTaskId.value) return;
  const nextTask = tasks.value.find((task) => task.status === 'waiting');
  if (!nextTask) return;
  activeTaskId.value = nextTask.id;
  updateTasks({ kind: 'progress', taskId: nextTask.id, progress: 0 });
  try {
    if (nextTask.kind === 'gif') {
      await api.value.startGifTask({ taskId: nextTask.id, inputPath: nextTask.inputPath, options: nextTask.gifOptions ?? normalizedOptions() });
    } else {
      await api.value.startWatermarkTask({ taskId: nextTask.id, inputPath: nextTask.inputPath, options: nextTask.watermarkOptions ?? normalizedWatermarkOptions() });
    }
  } catch (error) {
    updateTasks({ kind: 'failed', taskId: nextTask.id, message: error instanceof Error ? error.message : String(error) });
    activeTaskId.value = undefined;
    void startNextTask();
  }
}

function handleTaskEvent(event: MediaTaskEvent) {
  updateTasks(event);
  if ((event.kind === 'completed' || event.kind === 'failed' || event.kind === 'cancelled') && event.taskId === activeTaskId.value) {
    activeTaskId.value = undefined;
    void startNextTask();
  }
}

async function cancelActiveTask() {
  if (!api.value || !activeTaskId.value) return;
  try {
    await api.value.cancelTask(activeTaskId.value);
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error);
  }
}

function resetFailedOrCancelled() {
  tasks.value = tasks.value.filter((task) => task.status !== 'failed' && task.status !== 'cancelled');
}

function removeTask(taskId: string) {
  if (activeTaskId.value !== taskId) tasks.value = tasks.value.filter((task) => task.id !== taskId);
}

async function closePreview() {
  await closeGifMediaPreview();
}

onMounted(async () => {
  if (!desktop) return;
  try {
    api.value = await loadMediaDesktopApi();
    engine.value = await api.value.getEngineStatus();
    unlistenTaskEvents = await api.value.listenTaskEvents(handleTaskEvent);
    unlistenDroppedPaths = await api.value.listenDroppedPaths(appendPaths);
    const { listen } = await import('@tauri-apps/api/event');
    unlistenMode = await listen<'gif' | 'watermark'>('gif-media://mode', ({ payload }) => switchMode(payload));
  } catch (error) {
    engine.value = { ready: false, message: error instanceof Error ? error.message : '无法初始化桌面转换引擎。' };
  }
});

onUnmounted(() => {
  unlistenTaskEvents?.();
  unlistenDroppedPaths?.();
  unlistenMode?.();
});
</script>

<template>
  <main class="gif-media-preview" :aria-label="mode === 'gif' ? 'GIF / 媒体工具' : '水印与追溯'">
    <header class="gif-media-header">
      <div>
        <div class="gif-media-title-line">
          <h1>{{ mode === 'gif' ? 'GIF / 媒体工具' : '水印与追溯' }}</h1>
          <span class="gif-media-badge">内部实验</span>
        </div>
        <p v-if="desktop">{{ mode === 'gif' ? 'MP4 / MOV 转 GIF。所有任务仅使用应用内置转换引擎。' : '首版仅提供可见水印；隐形指纹暂未开放。' }}</p>
        <p v-else>真实处理仅桌面可用；浏览器不会创建、模拟或处理任务。</p>
      </div>
      <button type="button" class="gif-media-close" @click="closePreview">返回工具箱</button>
    </header>

    <div class="gif-media-layout">
      <section class="gif-media-queue" aria-labelledby="gif-media-queue-title">
        <div class="gif-media-section-header">
          <div>
            <span class="gif-media-kicker">任务队列</span>
            <h2 id="gif-media-queue-title">{{ tasks.length ? '待处理文件' : mode === 'gif' ? '等待添加媒体文件' : '等待添加水印文件' }}</h2>
          </div>
          <span class="gif-media-count">{{ tasks.length }} 个任务</span>
        </div>

        <button type="button" class="gif-media-dropzone" :disabled="!desktop" :aria-label="desktop ? '选择文件，也可拖入窗口' : '文件选择仅桌面可用'" @click="chooseMediaFiles">
          <strong>{{ mode === 'gif' ? '拖入 MP4 或 MOV' : '拖入图片、GIF、MP4 或 MOV' }}</strong>
          <span>{{ desktop ? '点击选择文件；拖入窗口也会加入队列。' : '浏览器模式不读取本地文件。' }}</span>
        </button>

        <div v-if="tasks.length" class="gif-media-task-list" aria-live="polite">
          <article v-for="task in tasks" :key="task.id" class="gif-media-task" :data-status="task.status">
            <div class="gif-media-task-main">
              <strong :title="task.inputPath">{{ task.name }}</strong>
              <span>{{ task.status === 'running' ? `处理中 ${Math.round(task.progress * 100)}%` : task.status === 'success' ? `已完成 · ${formatFileSize(task.outputBytes)}` : task.status === 'failed' ? task.error : task.status === 'cancelled' ? '已取消' : `等待${mediaTaskKindLabel(task.kind)}` }}</span>
              <span v-if="task.outputPath" class="gif-media-output" :title="task.outputPath">{{ task.outputPath }}</span>
              <div v-if="task.status === 'running'" class="gif-media-progress"><span :style="{ width: `${task.progress * 100}%` }" /></div>
            </div>
            <button v-if="task.status !== 'running'" type="button" class="gif-media-icon-button" :aria-label="`移除 ${task.name}`" title="移除任务" @click="removeTask(task.id)">×</button>
          </article>
        </div>
        <div v-else class="gif-media-empty-state">
          <strong>队列为空</strong>
          <p>{{ mode === 'gif' ? '添加 MP4 或 MOV 后，输出将写入你选择的新目录。' : '添加文件后，水印副本将写入你选择的新目录。' }}</p>
        </div>

        <div class="gif-media-status-legend" aria-label="任务状态图例">
          <span>等待</span><span>运行</span><span>成功</span><span>失败</span><span>取消</span>
        </div>
      </section>

      <aside class="gif-media-settings" aria-labelledby="gif-media-settings-title">
        <div class="gif-media-section-header">
          <div>
            <span class="gif-media-kicker">输出设置</span>
            <h2 id="gif-media-settings-title">{{ mode === 'gif' ? 'GIF 参数' : '可见水印' }}</h2>
          </div>
          <span class="gif-media-preview-only">{{ engine.ready ? '引擎已就绪' : '桌面引擎' }}</span>
        </div>

        <div class="gif-media-mode-tabs" role="tablist" aria-label="媒体工具模式">
          <button type="button" role="tab" :aria-selected="mode === 'gif'" :class="{ selected: mode === 'gif' }" :disabled="Boolean(activeTaskId)" @click="switchMode('gif')">GIF 转换</button>
          <button type="button" role="tab" :aria-selected="mode === 'watermark'" :class="{ selected: mode === 'watermark' }" :disabled="Boolean(activeTaskId)" @click="switchMode('watermark')">可见水印</button>
        </div>

        <template v-if="mode === 'gif'">
          <div class="gif-media-presets" aria-label="转换预设">
            <button v-for="(preset, id) in MEDIA_PRESETS" :key="id" type="button" :disabled="!desktop || Boolean(activeTaskId)" :class="{ selected: options.preset === id }" @click="applyPreset(id as MediaPreset)">{{ preset.label }}</button>
          </div>
          <div class="gif-media-form">
            <label><span>起始秒数</span><input v-model.number="options.startSeconds" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="0" step="0.1" placeholder="从开头开始" aria-label="起始秒数" /></label>
            <label><span>结束秒数</span><input v-model.number="options.endSeconds" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="0" step="0.1" placeholder="到结尾" aria-label="结束秒数" /></label>
            <label><span>输出宽度</span><input v-model.number="options.width" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="1" max="8192" step="2" placeholder="保持原尺寸" aria-label="输出宽度" /></label>
            <label><span>FPS</span><select v-model.number="options.fps" :disabled="!desktop || Boolean(activeTaskId)" aria-label="GIF 帧率"><option :value="12">12</option><option :value="15">15</option><option :value="24">24</option><option :value="30">30</option></select></label>
            <label><span>循环</span><select v-model="options.loop" :disabled="!desktop || Boolean(activeTaskId)" aria-label="GIF 循环"><option :value="true">循环播放</option><option :value="false">播放一次</option></select></label>
            <label><span>质量 / 体积</span><select v-model="options.preset" :disabled="!desktop || Boolean(activeTaskId)" aria-label="质量和体积倾向" @change="applyPreset(options.preset)"><option value="high">高清</option><option value="target-8mb">8MB 倾向（不保证）</option><option value="fast">快速预览</option><option value="original">原尺寸</option></select></label>
            <label><span>输出目录</span><button type="button" class="gif-media-directory" :disabled="!desktop || Boolean(activeTaskId)" :title="options.outputDirectory || '选择输出文件夹'" @click="chooseOutputDirectory">{{ options.outputDirectory || '选择输出文件夹' }}</button></label>
          </div>
        </template>

        <div v-else class="gif-media-form">
          <label><span>水印类型</span><select v-model="watermarkOptions.kind" :disabled="!desktop || Boolean(activeTaskId)" aria-label="水印类型"><option value="text">文字水印</option><option value="image">Logo / 图片水印</option></select></label>
          <label v-if="watermarkOptions.kind === 'text'"><span>水印文字</span><input v-model="watermarkOptions.text" :disabled="!desktop || Boolean(activeTaskId)" aria-label="水印文字" /></label>
          <label v-else><span>水印图片</span><button type="button" class="gif-media-directory" :disabled="!desktop || Boolean(activeTaskId)" :title="watermarkOptions.imagePath || '选择 Logo 或图片水印'" @click="chooseWatermarkImage">{{ watermarkOptions.imagePath || '选择 Logo 或图片水印' }}</button></label>
          <label><span>位置</span><select v-model="watermarkOptions.position" :disabled="!desktop || Boolean(activeTaskId)" aria-label="水印位置"><option value="top-left">左上</option><option value="top-center">顶部居中</option><option value="top-right">右上</option><option value="bottom-left">左下</option><option value="bottom-center">底部居中</option><option value="bottom-right">右下</option></select></label>
          <label><span>大小</span><input v-model.number="watermarkOptions.sizePercent" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="1" max="90" step="1" aria-label="水印大小百分比" /></label>
          <label><span>透明度</span><input v-model.number="watermarkOptions.opacity" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="0" max="1" step="0.05" aria-label="水印透明度" /></label>
          <label><span>铺满画面</span><select v-model="watermarkOptions.tiled" :disabled="!desktop || Boolean(activeTaskId)" aria-label="平铺水印"><option :value="false">单个</option><option :value="true">平铺</option></select></label>
          <label><span>输出目录</span><button type="button" class="gif-media-directory" :disabled="!desktop || Boolean(activeTaskId)" :title="watermarkOptions.outputDirectory || '选择输出文件夹'" @click="chooseOutputDirectory">{{ watermarkOptions.outputDirectory || '选择输出文件夹' }}</button></label>
        </div>

        <div class="gif-media-engine-note" :class="{ ready: engine.ready }" role="status">
          <strong>{{ engine.ready ? mode === 'gif' ? '转换引擎已就绪' : '可见水印已就绪' : desktop ? '转换引擎不可用' : '真实处理仅桌面可用' }}</strong>
          <span>{{ mode === 'watermark' && engine.ready ? '文字水印使用内置中文字体；隐形指纹暂未开放。' : engine.message }}</span>
        </div>
        <p v-if="message" class="gif-media-engine-message">{{ message }}</p>
        <button v-if="runningTask" type="button" class="gif-media-cancel" @click="cancelActiveTask">取消当前处理</button>
        <button v-else type="button" class="gif-media-start" :disabled="!canStart" @click="startNextTask">{{ mode === 'gif' ? '开始处理' : '开始添加水印' }}</button>
        <button v-if="tasks.some((task) => task.status === 'failed' || task.status === 'cancelled') && !runningTask" type="button" class="gif-media-clean" @click="resetFailedOrCancelled">清理失败与取消任务</button>
        <p class="gif-media-engine-message">不覆盖输入文件；重名输出会追加 `_2`、`_3`。</p>
      </aside>
    </div>
  </main>
</template>
