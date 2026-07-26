<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  applyMediaTaskEvent,
  clampRange,
  compressionPreferenceLabel,
  createGifTask,
  DEFAULT_CHROMA_KEY,
  DEFAULT_GIF_TASK_OPTIONS,
  formatFileSize,
  formatSeconds,
  MIN_SEGMENT_DURATION,
  TARGET_FILE_BYTES,
  type ChromaKeyOptions,
  type ChromaKeyMode,
  type CompressionPreference,
  type GifTask,
  type GifTaskOptions,
  type GifToolMode,
  type MediaEngineStatus,
  type MediaProbeResult,
  type MediaTaskEvent,
  type TemplateGifComposeRequest,
} from './types';

// ---- desktop API ----
const desktop = ref(false);
const api = ref<any>();

// ---- mode ----
const mode = ref<GifToolMode>('plain');
const pendingMode = ref<GifToolMode | null>(null);
const showModeConfirm = ref(false);
const modeConfirmRunning = ref(false);

// ---- engine ----
const engine = ref<MediaEngineStatus>({ ready: false, message: '正在检查内置转换引擎…' });

// ---- tasks & options ----
const tasks = ref<GifTask[]>([]);
const options = ref<GifTaskOptions>({ ...DEFAULT_GIF_TASK_OPTIONS, outputDirectory: '' });
const activeTaskId = ref<string>();
const message = ref('');

// ---- timeline & preview ----
const probe = ref<MediaProbeResult>();
const timelineStart = ref(0);
const timelineEnd = ref(0);
const playheadSeconds = ref(0);
const outputPreviewPath = ref('');
const outputPreviewBytes = ref(0);
const previewLoading = ref(false);
const previewTaskId = ref('');
const dragging = ref<'none' | 'playhead' | 'start' | 'end'>('none');
let previewDebounceTimer: ReturnType<typeof setTimeout> | undefined;

// ---- template mode ----
const templatePaths = ref<string[]>([]);
const chromaKey = ref<ChromaKeyOptions>({ ...DEFAULT_CHROMA_KEY });
const fitMode = ref<'cover' | 'contain'>('cover');
const templatePlaceholderColor = ref<'green' | 'blue' | 'custom'>('green');
const templateCustomColor = ref('#00FF00');

// ---- advanced ----
const showAdvanced = ref(false);

// ---- confirm dialog ----
const showSwitchConfirm = ref(false);
const switchConfirmRunning = ref(false);

// ---- event listeners ----
let unlistenTaskEvents: (() => void) | undefined;
let unlistenDroppedPaths: (() => void) | undefined;

// ---- computed ----
const videoPath = computed(() => tasks.value[0]?.inputPath ?? '');
const videoSrc = computed(() => {
  if (!desktop.value || !videoPath.value) return '';
  return `asset://localhost/${encodeURIComponent(videoPath.value)}`;
});
const timelineDuration = computed(() => probe.value?.duration ?? 0);
const canStart = computed(() =>
  desktop.value && engine.value.ready && Boolean(options.value.outputDirectory) &&
  tasks.value.some((t) => t.status === 'waiting') && !activeTaskId.value
);
const runningTask = computed(() => tasks.value.find((t) => t.id === activeTaskId.value));
const hasUnsavedWork = computed(() => tasks.value.length > 0 || probe.value !== undefined);

// ---- timeline helpers ----
function startPercent() { return `${(timelineStart.value / timelineDuration.value) * 100}%`; }
function endPercent() { return `${(timelineEnd.value / timelineDuration.value) * 100}%`; }
function playheadPercent() { return `${(playheadSeconds.value / timelineDuration.value) * 100}%`; }

function timelineClientX(event: PointerEvent): number { return event.clientX; }
function secondsFromEvent(event: PointerEvent, rect: DOMRect): number {
  const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  return frac * timelineDuration.value;
}

// ---- probe ----
async function probeFile(inputPath: string) {
  if (!api.value || !desktop.value) return;
  try {
    probe.value = await api.value.probeMedia(inputPath);
    timelineStart.value = 0;
    timelineEnd.value = probe.value.duration;
    playheadSeconds.value = 0;
    scheduleOutputPreview();
  } catch (e) { message.value = e instanceof Error ? e.message : String(e); }
}

// ---- file handling ----
async function addFiles(paths: string[]) {
  const existing = new Set(tasks.value.map((t) => t.inputPath));
  const supported = /\.(mp4|mov)$/i;
  const incoming = paths.filter((p) => supported.test(p) && !existing.has(p));
  if (!incoming.length) { message.value = '请选择 MP4 或 MOV'; return; }
  tasks.value = [...tasks.value, ...incoming.map((p, i) => createGifTask(p, tasks.value.length + i, { ...options.value, outputDirectory: options.value.outputDirectory }))];
  if (incoming.length > 0) await probeFile(incoming[0]);
  message.value = '';
}

async function chooseMediaFiles() {
  if (!api.value) return;
  addFiles(await api.value.pickMediaFiles());
}

async function chooseOutputDirectory() {
  if (!api.value) return;
  const dir = await api.value.pickOutputDirectory();
  if (!dir) return;
  options.value = { ...options.value, outputDirectory: dir };
}

async function chooseTemplateFiles() {
  if (!api.value) return;
  const paths = await api.value.pickTemplateFiles?.() ?? [];
  if (paths.length) templatePaths.value = [...templatePaths.value, ...paths];
}

function removeTemplate(index: number) { templatePaths.value = templatePaths.value.filter((_, i) => i !== index); }

// ---- preview ----
function scheduleOutputPreview() {
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => generateOutputPreview(), 350);
}

async function generateOutputPreview() {
  if (!api.value || !desktop.value || !probe.value || tasks.value.length === 0) return;
  const taskId = `preview-${Date.now()}`;
  if (previewTaskId.value) { try { await api.value.cancelPreviewTask(previewTaskId.value); } catch {} }
  previewTaskId.value = taskId;
  previewLoading.value = true;
  const tempDir = `${options.value.outputDirectory || '/tmp'}/.preview`;
  try {
    await api.value.previewGifFrame({
      taskId, inputPath: videoPath.value,
      startSeconds: timelineStart.value, endSeconds: timelineEnd.value,
      width: options.value.width, fps: options.value.fps, preset: 'high',
      tempDir,
    });
  } catch { previewLoading.value = false; outputPreviewPath.value = ''; }
}

// ---- timeline pointer handlers ----
function onTimelinePointerDown(event: PointerEvent) {
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  playheadSeconds.value = secondsFromEvent(event, rect);
  dragging.value = 'playhead';
  event.preventDefault();
  el.setPointerCapture?.(event.pointerId);
}
function onTimelinePointerMove(event: PointerEvent) {
  if (dragging.value === 'none') return;
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const sec = secondsFromEvent(event, rect);
  if (dragging.value === 'playhead') playheadSeconds.value = sec;
  else if (dragging.value === 'start') timelineStart.value = Math.max(0, Math.min(sec, timelineEnd.value - MIN_SEGMENT_DURATION));
  else if (dragging.value === 'end') timelineEnd.value = Math.max(timelineStart.value + MIN_SEGMENT_DURATION, Math.min(sec, timelineDuration.value));
}
function onTimelinePointerUp() { dragging.value = 'none'; scheduleOutputPreview(); }

function onStartHandleDown(event: PointerEvent) { dragging.value = 'start'; event.stopPropagation(); event.preventDefault(); (event.target as HTMLElement).setPointerCapture?.(event.pointerId); }
function onEndHandleDown(event: PointerEvent) { dragging.value = 'end'; event.stopPropagation(); event.preventDefault(); (event.target as HTMLElement).setPointerCapture?.(event.pointerId); }

function onStartInputChange() { const r = clampRange(timelineStart.value, timelineEnd.value, timelineDuration.value); timelineStart.value = r.startSeconds; timelineEnd.value = r.endSeconds; scheduleOutputPreview(); }
function onEndInputChange() { const r = clampRange(timelineStart.value, timelineEnd.value, timelineDuration.value); timelineStart.value = r.startSeconds; timelineEnd.value = r.endSeconds; scheduleOutputPreview(); }

// ---- compression preference ----
function setCompressionPreference(pref: CompressionPreference) {
  options.value = { ...options.value, compressionPreference: pref };
}

// ---- task lifecycle ----
function handleTaskEvent(event: MediaTaskEvent) {
  // preview events
  if (event.kind === 'completed' && event.taskId === previewTaskId.value) {
    outputPreviewPath.value = event.outputPath;
    outputPreviewBytes.value = event.outputBytes;
    previewLoading.value = false;
  }
  if (event.kind === 'failed' && event.taskId === previewTaskId.value) {
    previewLoading.value = false;
  }
  // task events
  tasks.value = applyMediaTaskEvent(tasks.value, event);
  if ((event.kind === 'completed' || event.kind === 'failed' || event.kind === 'cancelled') && event.taskId === activeTaskId.value) {
    activeTaskId.value = undefined;
    void startNextTask();
  }
}

async function startNextTask() {
  if (!api.value || activeTaskId.value) return;
  const next = tasks.value.find((t) => t.status === 'waiting');
  if (!next) return;
  activeTaskId.value = next.id;
  tasks.value = tasks.value.map((t) => t.id === next.id ? { ...t, status: 'running' as const, progress: 0 } : t);
  try {
    // Use the existing GIF task command from Rust
    await api.value.startGifTask({
      taskId: next.id,
      inputPath: next.inputPath,
      options: {
        startSeconds: timelineStart.value || undefined,
        endSeconds: timelineEnd.value || undefined,
        width: options.value.width,
        fps: options.value.fps,
        loopPlayback: true, // always infinite
        preset: 'high',
        outputDirectory: options.value.outputDirectory,
        // 8MB retry fields sent to Rust
        targetBytes: TARGET_FILE_BYTES,
        compressionPreference: options.value.compressionPreference,
        minWidth: options.value.minWidth,
        minFps: options.value.minFps,
        allowStrongCompression: options.value.allowStrongCompression,
      },
    });
  } catch (error) {
    tasks.value = tasks.value.map((t) => t.id === next.id ? { ...t, status: 'failed', error: error instanceof Error ? error.message : String(error) } : t);
    activeTaskId.value = undefined;
    void startNextTask();
  }
}

async function cancelActiveTask() {
  if (!api.value || !activeTaskId.value) return;
  try { await api.value.cancelTask(activeTaskId.value); } catch (e) { message.value = e instanceof Error ? e.message : String(e); }
}
function resetFailedOrCancelled() { tasks.value = tasks.value.filter((t) => t.status !== 'failed' && t.status !== 'cancelled'); }
function removeTask(taskId: string) {
  if (activeTaskId.value === taskId) return;
  tasks.value = tasks.value.filter((t) => t.id !== taskId);
  if (tasks.value.length === 0) { probe.value = undefined; outputPreviewPath.value = ''; }
  else if (taskId === tasks.value[0]?.id && tasks.value[0]) probeFile(tasks.value[0].inputPath);
}

// ---- mode switching ----
function requestModeSwitch(nextMode: GifToolMode) {
  if (mode.value === nextMode) return;
  if (activeTaskId.value) {
    pendingMode.value = nextMode;
    modeConfirmRunning.value = true;
    showModeConfirm.value = true;
    return;
  }
  if (hasUnsavedWork.value) {
    pendingMode.value = nextMode;
    modeConfirmRunning.value = false;
    showModeConfirm.value = true;
    return;
  }
  executeModeSwitch(nextMode);
}

function executeModeSwitch(nextMode: GifToolMode) {
  mode.value = nextMode;
  tasks.value = [];
  message.value = '';
  outputPreviewPath.value = '';
  probe.value = undefined;
  templatePaths.value = [];
  chromaKey.value = { ...DEFAULT_CHROMA_KEY };
  showModeConfirm.value = false;
  pendingMode.value = null;
}

function confirmModeSwitch() {
  if (modeConfirmRunning.value && activeTaskId.value) {
    cancelActiveTask();
  }
  if (pendingMode.value) executeModeSwitch(pendingMode.value);
}

function cancelModeSwitch() {
  showModeConfirm.value = false;
  pendingMode.value = null;
}

// ---- tool switch confirmation (navigate to watermark) ----
async function openWatermarkTool() {
  if (activeTaskId.value) {
    switchConfirmRunning.value = true;
    showSwitchConfirm.value = true;
    return;
  }
  if (hasUnsavedWork.value) {
    switchConfirmRunning.value = false;
    showSwitchConfirm.value = true;
    return;
  }
  await navigateToWatermark();
}

async function navigateToWatermark() {
  showSwitchConfirm.value = false;
  // In embedded mode, navigation is handled by parent React app
}

function confirmToolSwitch() {
  if (switchConfirmRunning.value && activeTaskId.value) {
    cancelActiveTask();
  }
  navigateToWatermark();
}

function cancelToolSwitch() { showSwitchConfirm.value = false; }

// ---- return to toolbox ----
async function returnToToolbox() {
  if (activeTaskId.value) {
    switchConfirmRunning.value = true;
    showSwitchConfirm.value = true;
    return;
  }
  if (hasUnsavedWork.value) {
    switchConfirmRunning.value = false;
    showSwitchConfirm.value = true;
    return;
  }
  window.dispatchEvent(new CustomEvent('gif-tool-confirmed-return'));
}

// ---- lifecycle ----
async function initDesktop() {
  try {
    const mod = await import('../gif-media/mediaDesktop');
    const { isMediaDesktopAvailable } = mod;
    if (!isMediaDesktopAvailable()) { desktop.value = false; engine.value = { ready: false, message: '真实转换仅桌面可用。' }; return; }
    desktop.value = true;
    const { loadMediaDesktopApi } = mod;
    api.value = await loadMediaDesktopApi();
    engine.value = await api.value.getEngineStatus();
    unlistenTaskEvents = await api.value.listenTaskEvents(handleTaskEvent);
    unlistenDroppedPaths = await api.value.listenDroppedPaths((paths: string[]) => addFiles(paths));
  } catch (error) {
    engine.value = { ready: false, message: error instanceof Error ? error.message : '无法初始化桌面转换引擎。' };
  }
}

onMounted(() => {
  window.addEventListener('gif-tool-request-return', returnToToolbox);
  void initDesktop();
});
onUnmounted(() => {
  unlistenTaskEvents?.();
  unlistenDroppedPaths?.();
  window.removeEventListener('gif-tool-request-return', returnToToolbox);
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
});
</script>

<template>
  <main class="gif-tool" aria-label="GIF 合成与压缩">
    <!-- Sub-mode tabs -->
    <nav class="gif-tool-mode-tabs" role="tablist" aria-label="GIF 处理模式">
      <button type="button" role="tab" :aria-selected="mode === 'template'" :class="{ selected: mode === 'template' }" @click="requestModeSwitch('template')">多语言模板合成</button>
      <button type="button" role="tab" :aria-selected="mode === 'plain'" :class="{ selected: mode === 'plain' }" @click="requestModeSwitch('plain')">普通视频转 GIF</button>
    </nav>

    <!-- Main layout: two columns -->
    <div class="gif-tool-layout">
      <!-- Left: preview panel -->
      <section class="gif-tool-preview-panel" aria-label="媒体预览">
        <div class="gif-tool-section-header">
          <div><span class="gif-tool-kicker">截取区间</span><h2>{{ probe ? '拖动手柄选择片段' : '等待导入视频' }}</h2></div>
        </div>
        <div v-if="probe" class="gif-tool-probe-info">
          <span>{{ probe.width }}×{{ probe.height }} · {{ probe.fps.toFixed(1) }} fps · {{ probe.codec }} · {{ formatSeconds(timelineDuration) }}</span>
        </div>
        <div v-if="probe" class="gif-tool-preview-dual">
          <div class="gif-tool-preview-original">
            <span class="gif-tool-preview-label">原片</span>
            <div class="gif-tool-video-wrap">
              <video v-if="videoSrc" :src="videoSrc" muted :currentTime="playheadSeconds" class="gif-tool-video" loop />
            </div>
          </div>
          <div class="gif-tool-preview-output">
            <span class="gif-tool-preview-label">输出预览</span>
            <div class="gif-tool-video-wrap">
              <img v-if="outputPreviewPath" :src="'asset://localhost/' + encodeURIComponent(outputPreviewPath)" class="gif-tool-video" alt="输出预览" />
              <span v-else-if="previewLoading" class="gif-tool-preview-loading">生成预览中…</span>
              <span v-else class="gif-tool-preview-loading">等待参数</span>
            </div>
            <span v-if="outputPreviewBytes" class="gif-tool-preview-size">{{ formatFileSize(outputPreviewBytes) }}</span>
          </div>
        </div>

        <!-- Timeline -->
        <div v-if="probe" class="gif-tool-timeline" ref="timelineRef"
          @pointerdown="onTimelinePointerDown" @pointermove="onTimelinePointerMove" @pointerup="onTimelinePointerUp"
          role="slider" :aria-label="`截取区间 ${formatSeconds(playheadSeconds)} / ${formatSeconds(timelineDuration)}`"
          :aria-valuemin="0" :aria-valuemax="Math.floor(timelineDuration)"
          :aria-valuenow="Math.floor(playheadSeconds)" :aria-valuetext="formatSeconds(playheadSeconds)" tabindex="0"
          @keydown.left.prevent="playheadSeconds = Math.max(0, playheadSeconds - 0.5)"
          @keydown.right.prevent="playheadSeconds = Math.min(timelineDuration, playheadSeconds + 0.5)"
          @keydown.shift.left.prevent="timelineStart = Math.max(0, timelineStart - 0.5); onStartInputChange()"
          @keydown.shift.right.prevent="timelineEnd = Math.min(timelineDuration, timelineEnd + 0.5); onEndInputChange()">
          <div class="gif-tool-timeline-track">
            <div class="gif-tool-timeline-selection" :style="{ left: startPercent(), width: `calc(${endPercent()} - ${startPercent()})` }" />
            <div class="gif-tool-timeline-playhead" :style="{ left: playheadPercent() }" />
            <div class="gif-tool-timeline-handle gif-tool-timeline-handle-start" :style="{ left: startPercent() }" @pointerdown="onStartHandleDown" role="slider" :aria-label="'开始 ' + formatSeconds(timelineStart)" :aria-valuemin="0" :aria-valuemax="Math.floor(timelineEnd)" :aria-valuenow="Math.floor(timelineStart)" tabindex="0" />
            <div class="gif-tool-timeline-handle gif-tool-timeline-handle-end" :style="{ left: endPercent() }" @pointerdown="onEndHandleDown" role="slider" :aria-label="'结束 ' + formatSeconds(timelineEnd)" :aria-valuemin="Math.floor(timelineStart)" :aria-valuemax="Math.floor(timelineDuration)" :aria-valuenow="Math.floor(timelineEnd)" tabindex="0" />
          </div>
        </div>
        <div v-if="probe" class="gif-tool-time-inputs">
          <label>开始<input type="number" v-model.number="timelineStart" :min="0" :max="timelineEnd - MIN_SEGMENT_DURATION" step="0.1" @change="onStartInputChange" aria-label="开始秒数" /></label>
          <label>结束<input type="number" v-model.number="timelineEnd" :min="timelineStart + MIN_SEGMENT_DURATION" :max="timelineDuration" step="0.1" @change="onEndInputChange" aria-label="结束秒数" /></label>
          <span class="gif-tool-time-duration">{{ formatSeconds(timelineDuration) }}</span>
          <button v-if="timelineStart > 0 || timelineEnd < timelineDuration" type="button" class="gif-tool-reset-range" @click="timelineStart = 0; timelineEnd = timelineDuration; scheduleOutputPreview()">恢复完整时长</button>
          <span class="gif-tool-segment-duration">选中片段：{{ formatSeconds(timelineEnd - timelineStart) }}</span>
        </div>
      </section>

      <!-- Right: queue + params -->
      <section class="gif-tool-queue" aria-labelledby="gif-tool-queue-title">
        <div class="gif-tool-section-header">
          <div><span class="gif-tool-kicker">任务队列</span><h2 id="gif-tool-queue-title">{{ tasks.length ? '待处理视频文件' : '等待添加视频文件' }}</h2></div>
          <span class="gif-tool-count">{{ tasks.length }} 个任务</span>
        </div>
        <button type="button" class="gif-tool-dropzone" :disabled="!desktop" :aria-label="desktop ? '选择 MP4 或 MOV 文件' : '仅桌面可用'" @click="chooseMediaFiles">
          <strong>拖入 MP4 或 MOV</strong>
          <span>{{ desktop ? '点击选择文件；拖入窗口也会加入队列。' : '浏览器模式不读取本地文件。' }}</span>
        </button>

        <div v-if="tasks.length" class="gif-tool-task-list" aria-live="polite">
          <article v-for="task in tasks" :key="task.id" class="gif-tool-task" :data-status="task.status">
            <div class="gif-tool-task-main">
              <strong :title="task.inputPath">{{ task.name }}</strong>
              <span>{{ task.status === 'running' ? `处理中 ${Math.round(task.progress * 100)}%` : task.status === 'success' ? `已完成 · ${formatFileSize(task.outputBytes)}` : task.status === 'failed' ? task.error : task.status === 'cancelled' ? '已取消' : '等待处理' }}</span>
              <span v-if="task.outputPath" class="gif-tool-output" :title="task.outputPath">{{ task.outputPath }}</span>
              <div v-if="task.status === 'running'" class="gif-tool-progress"><span :style="{ width: `${task.progress * 100}%` }" /></div>
            </div>
            <button v-if="task.status !== 'running'" type="button" class="gif-tool-icon-button" :aria-label="`移除 ${task.name}`" title="移除任务" @click="removeTask(task.id)">×</button>
          </article>
        </div>
        <div v-else class="gif-tool-empty-state">
          <strong>队列为空</strong>
          <p>添加 MP4 或 MOV 后，输出将写入你选择的新目录。每个 GIF 严格小于 8MB。</p>
        </div>
      </section>
    </div>

    <!-- Settings sidebar -->
    <aside class="gif-tool-settings" aria-labelledby="gif-tool-settings-title">
      <div class="gif-tool-section-header">
        <div><span class="gif-tool-kicker">输出设置</span><h2 id="gif-tool-settings-title">GIF 参数</h2></div>
        <span class="gif-tool-engine-status">{{ engine.ready ? '引擎已就绪' : '桌面引擎' }}</span>
      </div>

      <!-- Template mode: template management -->
      <div v-if="mode === 'template'" class="gif-tool-template-section">
        <div class="gif-tool-section-header" style="margin-top: 0;">
          <div><span class="gif-tool-kicker">模板管理</span><h3>语种模板</h3></div>
        </div>
        <button type="button" class="gif-tool-dropzone gif-tool-dropzone-small" :disabled="!desktop" @click="chooseTemplateFiles">
          <strong>添加模板 PNG</strong><span>来自 Figma 的多语种模板图片</span>
        </button>
        <div v-if="templatePaths.length" class="gif-tool-template-list">
          <div v-for="(path, i) in templatePaths" :key="i" class="gif-tool-template-item">
            <span :title="path">{{ path.split('/').at(-1) || path.split('\\').at(-1) || path }}</span>
            <button type="button" @click="removeTemplate(i)" aria-label="移除模板">×</button>
          </div>
        </div>

        <div class="gif-tool-section-header" style="margin-top: 12px;">
          <div><span class="gif-tool-kicker">视频填充</span><h3>占位区域</h3></div>
        </div>
        <div class="gif-tool-form">
          <label><span>占位色</span>
            <select v-model="templatePlaceholderColor" aria-label="模板占位色">
              <option value="green">绿色 #00FF00</option>
              <option value="blue">蓝色 #0000FF</option>
              <option value="custom">自定义纯色</option>
            </select>
          </label>
          <label v-if="templatePlaceholderColor === 'custom'"><span>自定义色值</span><input v-model="templateCustomColor" type="text" placeholder="#00FF00" aria-label="自定义占位色值" /></label>
          <label><span>填充方式</span>
            <select v-model="fitMode" aria-label="视频填充方式">
              <option value="cover">裁切填充 (cover)</option>
              <option value="contain">完整显示 (contain)</option>
            </select>
          </label>
        </div>
        <div class="gif-tool-chromakey-notice">
          <strong>色键抠像（暂未开放）</strong>
          <p>未来通过色键将视频合成到模板占位区域。当前仅预留接口，不执行抠像。</p>
        </div>
      </div>

      <!-- Common params -->
      <div class="gif-tool-form">
        <label><span>输出宽度</span><input v-model.number="options.width" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="1" max="8192" step="2" placeholder="保持原尺寸" aria-label="输出宽度" @change="scheduleOutputPreview" /></label>
        <label><span>帧率 (FPS)</span><select v-model.number="options.fps" :disabled="!desktop || Boolean(activeTaskId)" aria-label="GIF 帧率" @change="scheduleOutputPreview"><option :value="12">12</option><option :value="15">15</option><option :value="24">24</option><option :value="30">30</option></select></label>
        <label><span>输出目录</span><button type="button" class="gif-tool-directory" :disabled="!desktop || Boolean(activeTaskId)" :title="options.outputDirectory || '选择输出文件夹'" @click="chooseOutputDirectory">{{ options.outputDirectory || '选择输出文件夹' }}</button></label>
      </div>

      <!-- Compression preference -->
      <div class="gif-tool-section-header" style="margin-top: 8px;">
        <div><span class="gif-tool-kicker">压缩偏好</span><h3>体积控制策略</h3></div>
      </div>
      <div class="gif-tool-compression-presets" aria-label="压缩偏好">
        <button v-for="pref in (['balanced', 'clarity', 'smoothness'] as CompressionPreference[])" :key="pref" type="button" :class="{ selected: options.compressionPreference === pref }" :disabled="!desktop || Boolean(activeTaskId)" @click="setCompressionPreference(pref)">
          {{ compressionPreferenceLabel(pref) }}
        </button>
      </div>
      <p class="gif-tool-compression-hint">最终文件严格小于 8MB，超限自动重试。</p>

      <!-- Advanced (collapsible) -->
      <button type="button" class="gif-tool-advanced-toggle" @click="showAdvanced = !showAdvanced" :aria-expanded="showAdvanced">
        {{ showAdvanced ? '▾' : '▸' }} 高级选项
      </button>
      <div v-if="showAdvanced" class="gif-tool-form">
        <label><span>最低输出宽度</span><input v-model.number="options.minWidth" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="1" max="8192" step="2" placeholder="不限制" aria-label="最低输出宽度" /></label>
        <label><span>最低帧率</span><input v-model.number="options.minFps" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="1" max="60" step="1" placeholder="不限制" aria-label="最低帧率" /></label>
        <label><span>允许强压缩</span><select v-model="options.allowStrongCompression" :disabled="!desktop || Boolean(activeTaskId)" aria-label="允许强压缩"><option :value="false">否</option><option :value="true">是</option></select></label>
      </div>

      <!-- Engine status -->
      <div class="gif-tool-engine-note" :class="{ ready: engine.ready }" role="status">
        <strong>{{ engine.ready ? '转换引擎已就绪' : desktop ? '转换引擎不可用' : '真实处理仅桌面可用' }}</strong>
        <span>{{ engine.message }}</span>
      </div>
      <p v-if="message" class="gif-tool-engine-message">{{ message }}</p>

      <!-- Actions -->
      <button v-if="runningTask" type="button" class="gif-tool-cancel" @click="cancelActiveTask">取消当前处理</button>
      <button v-else type="button" class="gif-tool-start" :disabled="!canStart" @click="startNextTask">开始处理</button>
      <button v-if="tasks.some((t) => t.status === 'failed' || t.status === 'cancelled') && !runningTask" type="button" class="gif-tool-clean" @click="resetFailedOrCancelled">清理失败与取消任务</button>
      <p class="gif-tool-engine-message">不覆盖输入文件；重名输出自动追加序号。每个 GIF 严格小于 8MB。</p>
    </aside>

    <!-- Mode switch confirm dialog -->
    <div v-if="showModeConfirm" class="gif-tool-modal-overlay" @click.self="cancelModeSwitch">
      <div class="gif-tool-confirm-dialog" role="alertdialog" aria-label="切换模式确认">
        <template v-if="modeConfirmRunning">
          <p><strong>当前仍有任务正在处理。</strong></p>
          <p>切换模式将取消当前任务并清空所有操作。</p>
        </template>
        <template v-else>
          <p><strong>切换模式后，当前导入文件、参数设置和未保存操作将被清空。</strong></p>
          <p>已经导出的文件不会被删除。</p>
        </template>
        <div class="gif-tool-confirm-actions">
          <button type="button" class="gif-tool-confirm-cancel" @click="cancelModeSwitch">{{ modeConfirmRunning ? '继续处理' : '取消' }}</button>
          <button type="button" class="gif-tool-confirm-proceed" @click="confirmModeSwitch">{{ modeConfirmRunning ? '取消任务并切换' : '清空并切换' }}</button>
        </div>
      </div>
    </div>

    <!-- Tool switch confirm dialog -->
    <div v-if="showSwitchConfirm" class="gif-tool-modal-overlay" @click.self="cancelToolSwitch">
      <div class="gif-tool-confirm-dialog" role="alertdialog" aria-label="切换工具确认">
        <template v-if="switchConfirmRunning">
          <p><strong>当前仍有任务正在处理。</strong></p>
          <p>切换工具将取消当前任务并清空操作。</p>
        </template>
        <template v-else>
          <p><strong>切换工具后，当前导入文件、参数设置和未保存操作将被清空。</strong></p>
          <p>已经导出的文件不会被删除。</p>
        </template>
        <div class="gif-tool-confirm-actions">
          <button type="button" class="gif-tool-confirm-cancel" @click="cancelToolSwitch">{{ switchConfirmRunning ? '继续处理' : '取消' }}</button>
          <button type="button" class="gif-tool-confirm-proceed" @click="confirmToolSwitch">{{ switchConfirmRunning ? '取消任务并切换' : '清空并切换' }}</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* styles will be in gifTool.css */
</style>
