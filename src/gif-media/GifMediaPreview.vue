<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { closeGifMediaPreview } from '../app/gifMediaLauncher';
import { isMediaDesktopAvailable, loadMediaDesktopApi, type MediaDesktopApi } from './mediaDesktop';
import {
  applyMediaPreset,
  applyMediaTaskEvent,
  createMediaTask,
  DEFAULT_GIF_MEDIA_OPTIONS,
  formatFileSize,
  MEDIA_PRESETS,
  type GifMediaOptions,
  type GifMediaTask,
  type MediaEngineStatus,
  type MediaPreset,
  type MediaTaskEvent
} from './mediaTypes';

// Source note: the queue surface and interaction semantics are adapted from FFUI
// 4122222415bc209c711c7c166fc78d2d6d1dc139. This implementation only uses the
// current app's Tauri commands and bundled sidecars; no FFUI backend is imported.
const desktop = isMediaDesktopAvailable();
const tasks = ref<GifMediaTask[]>([]);
const api = ref<MediaDesktopApi>();
const engine = ref<MediaEngineStatus>({ ready: false, message: desktop ? '正在检查内置转换引擎…' : '真实转换仅桌面可用。' });
const options = ref<GifMediaOptions>({ ...DEFAULT_GIF_MEDIA_OPTIONS, outputDirectory: '' });
const message = ref('');
const activeTaskId = ref<string>();
let unlistenTaskEvents: (() => void) | undefined;
let unlistenDroppedPaths: (() => void) | undefined;

const canStart = computed(() => desktop && engine.value.ready && Boolean(options.value.outputDirectory) && tasks.value.some((task) => task.status === 'waiting') && !activeTaskId.value);
const runningTask = computed(() => tasks.value.find((task) => task.id === activeTaskId.value));

function updateTasks(event: MediaTaskEvent) {
  tasks.value = applyMediaTaskEvent(tasks.value, event);
}

function appendPaths(paths: string[]) {
  const existing = new Set(tasks.value.map((task) => task.inputPath));
  const incoming = paths.filter((path) => /\.(mp4|mov)$/i.test(path) && !existing.has(path));
  if (!incoming.length) {
    message.value = '请选择 MP4 或 MOV 文件；重复文件不会重复加入队列。';
    return;
  }
  tasks.value = [...tasks.value, ...incoming.map((path, index) => createMediaTask(path, tasks.value.length + index))];
  message.value = '';
}

async function chooseMediaFiles() {
  if (!api.value) return;
  appendPaths(await api.value.pickMediaFiles());
}

async function chooseOutputDirectory() {
  if (!api.value) return;
  const directory = await api.value.pickOutputDirectory();
  if (directory) options.value = { ...options.value, outputDirectory: directory };
}

function applyPreset(preset: MediaPreset) {
  options.value = applyMediaPreset(options.value, preset);
}

function normalizedOptions(): GifMediaOptions {
  const finiteOrUndefined = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return {
    ...options.value,
    startSeconds: finiteOrUndefined(options.value.startSeconds),
    endSeconds: finiteOrUndefined(options.value.endSeconds),
    width: finiteOrUndefined(options.value.width)
  };
}

async function startNextTask() {
  if (!api.value || activeTaskId.value) return;
  const nextTask = tasks.value.find((task) => task.status === 'waiting');
  if (!nextTask) return;
  activeTaskId.value = nextTask.id;
  updateTasks({ kind: 'progress', taskId: nextTask.id, progress: 0 });
  try {
    await api.value.startGifTask({ taskId: nextTask.id, inputPath: nextTask.inputPath, options: normalizedOptions() });
  } catch (error) {
    updateTasks({ kind: 'failed', taskId: nextTask.id, message: error instanceof Error ? error.message : String(error) });
    activeTaskId.value = undefined;
    void startNextTask();
  }
}

function handleTaskEvent(event: MediaTaskEvent) {
  updateTasks(event);
  if (event.kind === 'completed' || event.kind === 'failed' || event.kind === 'cancelled') {
    if (event.taskId === activeTaskId.value) {
      activeTaskId.value = undefined;
      void startNextTask();
    }
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
  if (activeTaskId.value === taskId) return;
  tasks.value = tasks.value.filter((task) => task.id !== taskId);
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
  } catch (error) {
    engine.value = { ready: false, message: error instanceof Error ? error.message : '无法初始化桌面转换引擎。' };
  }
});

onUnmounted(() => {
  unlistenTaskEvents?.();
  unlistenDroppedPaths?.();
});
</script>

<template>
  <main class="gif-media-preview" aria-label="GIF / 媒体工具">
    <header class="gif-media-header">
      <div>
        <div class="gif-media-title-line">
          <h1>GIF / 媒体工具</h1>
          <span class="gif-media-badge">实验功能</span>
        </div>
        <p v-if="desktop">MP4 / MOV 转 GIF。所有任务仅使用应用内置转换引擎。</p>
        <p v-else>真实转换仅桌面可用；浏览器不会创建、模拟或处理媒体任务。</p>
      </div>
      <button type="button" class="gif-media-close" @click="closePreview">返回工具箱</button>
    </header>

    <div class="gif-media-layout">
      <section class="gif-media-queue" aria-labelledby="gif-media-queue-title">
        <div class="gif-media-section-header">
          <div>
            <span class="gif-media-kicker">任务队列</span>
            <h2 id="gif-media-queue-title">{{ tasks.length ? '待处理媒体文件' : '等待添加媒体文件' }}</h2>
          </div>
          <span class="gif-media-count">{{ tasks.length }} 个任务</span>
        </div>

        <button type="button" class="gif-media-dropzone" :disabled="!desktop" :aria-label="desktop ? '选择 MP4 或 MOV 文件，也可拖入窗口' : '媒体文件选择仅桌面可用'" @click="chooseMediaFiles">
          <strong>拖入 MP4 或 MOV</strong>
          <span>{{ desktop ? '点击选择文件；拖入窗口也会加入队列。' : '浏览器模式不读取本地媒体文件。' }}</span>
        </button>

        <div v-if="tasks.length" class="gif-media-task-list" aria-live="polite">
          <article v-for="task in tasks" :key="task.id" class="gif-media-task" :data-status="task.status">
            <div class="gif-media-task-main">
              <strong :title="task.inputPath">{{ task.name }}</strong>
              <span>{{ task.status === 'running' ? `处理中 ${Math.round(task.progress * 100)}%` : task.status === 'success' ? `已完成 · ${formatFileSize(task.outputBytes)}` : task.status === 'failed' ? task.error : task.status === 'cancelled' ? '已取消' : '等待处理' }}</span>
              <span v-if="task.outputPath" class="gif-media-output" :title="task.outputPath">{{ task.outputPath }}</span>
              <div v-if="task.status === 'running'" class="gif-media-progress"><span :style="{ width: `${task.progress * 100}%` }" /></div>
            </div>
            <button v-if="task.status !== 'running'" type="button" class="gif-media-icon-button" :aria-label="`移除 ${task.name}`" title="移除任务" @click="removeTask(task.id)">×</button>
          </article>
        </div>
        <div v-else class="gif-media-empty-state">
          <strong>队列为空</strong>
          <p>添加 MP4 或 MOV 后，输出将写入你选择的新目录。</p>
        </div>

        <div class="gif-media-status-legend" aria-label="任务状态图例">
          <span>等待</span><span>运行</span><span>成功</span><span>失败</span><span>取消</span>
        </div>
      </section>

      <aside class="gif-media-settings" aria-labelledby="gif-media-settings-title">
        <div class="gif-media-section-header">
          <div>
            <span class="gif-media-kicker">输出设置</span>
            <h2 id="gif-media-settings-title">GIF 参数</h2>
          </div>
          <span class="gif-media-preview-only">{{ engine.ready ? '引擎已就绪' : '桌面引擎' }}</span>
        </div>

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

        <div class="gif-media-engine-note" :class="{ ready: engine.ready }" role="status">
          <strong>{{ engine.ready ? '转换引擎已就绪' : desktop ? '转换引擎不可用' : '真实转换仅桌面可用' }}</strong>
          <span>{{ engine.message }}</span>
        </div>
        <p v-if="message" class="gif-media-engine-message">{{ message }}</p>
        <button v-if="runningTask" type="button" class="gif-media-cancel" @click="cancelActiveTask">取消当前处理</button>
        <button v-else type="button" class="gif-media-start" :disabled="!canStart" @click="startNextTask">开始处理</button>
        <button v-if="tasks.some((task) => task.status === 'failed' || task.status === 'cancelled') && !runningTask" type="button" class="gif-media-clean" @click="resetFailedOrCancelled">清理失败与取消任务</button>
        <p class="gif-media-engine-message">不覆盖输入文件；重名输出会追加 `_2`、`_3`。</p>
      </aside>
    </div>
  </main>
</template>
