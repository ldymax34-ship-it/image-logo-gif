<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  applyWatermarkTaskEvent,
  createWatermarkTask,
  DEFAULT_WATERMARK_OPTIONS,
  formatFileSize,
  type MediaEngineStatus,
  type MediaTaskEvent,
  type WatermarkOptions,
  type WatermarkTask,
} from './types';

// ---- desktop API ----
const desktop = ref(false);
const api = ref<any>();

// ---- engine ----
const engine = ref<MediaEngineStatus>({ ready: false, message: '正在检查内置转换引擎…' });

// ---- tasks & options ----
const tasks = ref<WatermarkTask[]>([]);
const options = ref<WatermarkOptions>({ ...DEFAULT_WATERMARK_OPTIONS, outputDirectory: '' });
const activeTaskId = ref<string>();
const message = ref('');

// ---- confirm dialogs ----
const showSwitchConfirm = ref(false);
const switchConfirmRunning = ref(false);

// ---- event listeners ----
let unlistenTaskEvents: (() => void) | undefined;
let unlistenDroppedPaths: (() => void) | undefined;

// ---- computed ----
const canStart = computed(() =>
  desktop.value && engine.value.ready && Boolean(options.value.outputDirectory) &&
  tasks.value.some((t) => t.status === 'waiting') && !activeTaskId.value
);
const runningTask = computed(() => tasks.value.find((t) => t.id === activeTaskId.value));
const hasUnsavedWork = computed(() => tasks.value.length > 0);

// ---- file handling ----
async function addFiles(paths: string[]) {
  const existing = new Set(tasks.value.map((t) => t.inputPath));
  const supported = /\.(png|jpe?g|webp|gif|mp4|mov)$/i;
  const incoming = paths.filter((p) => supported.test(p) && !existing.has(p));
  if (!incoming.length) { message.value = '请选择 PNG、JPG、WebP、GIF、MP4 或 MOV'; return; }
  tasks.value = [...tasks.value, ...incoming.map((p, i) => createWatermarkTask(p, tasks.value.length + i, { ...options.value, outputDirectory: options.value.outputDirectory }))];
  message.value = '';
}

async function chooseFiles() {
  if (!api.value) return;
  addFiles(await api.value.pickWatermarkFiles());
}

async function chooseOutputDirectory() {
  if (!api.value) return;
  const dir = await api.value.pickOutputDirectory();
  if (!dir) return;
  options.value = { ...options.value, outputDirectory: dir };
}

async function chooseWatermarkImage() {
  if (!api.value) return;
  const imagePath = await api.value.pickWatermarkImage();
  if (imagePath) options.value = { ...options.value, imagePath };
}

// ---- task lifecycle ----
function handleTaskEvent(event: MediaTaskEvent) {
  tasks.value = applyWatermarkTaskEvent(tasks.value, event);
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
    await api.value.startWatermarkTask({
      taskId: next.id,
      inputPath: next.inputPath,
      options: {
        kind: options.value.kind,
        text: options.value.text,
        imagePath: options.value.imagePath,
        position: options.value.position,
        sizePercent: options.value.sizePercent,
        opacity: options.value.opacity,
        tiled: options.value.tiled,
        outputDirectory: options.value.outputDirectory,
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
}

// ---- tool switch ----
async function openGifTool() {
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
  await navigateToGif();
}

async function navigateToGif() {
  showSwitchConfirm.value = false;
  try {
    const { openGifMediaPreview } = await import('../app/gifMediaLauncher');
    await import('@tauri-apps/api/webviewWindow').then(m => m.getCurrentWebviewWindow().close());
    await openGifMediaPreview({ mode: 'gif' });
  } catch {}
}

function confirmToolSwitch() {
  if (switchConfirmRunning.value && activeTaskId.value) cancelActiveTask();
  navigateToGif();
}

function cancelToolSwitch() { showSwitchConfirm.value = false; }

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
  try {
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    getCurrentWebviewWindow().close();
  } catch {}
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

onMounted(() => initDesktop());
onUnmounted(() => { unlistenTaskEvents?.(); unlistenDroppedPaths?.(); });
</script>

<template>
  <main class="watermark-tool" aria-label="水印与追溯">
    <header class="watermark-tool-header">
      <div class="watermark-tool-title-line">
        <h1>水印与追溯</h1>
        <span class="watermark-tool-badge">内部实验</span>
      </div>
      <p>首版仅提供可见水印；隐形指纹暂未开放。</p>
    </header>

    <div class="watermark-tool-layout">
      <!-- Left: queue -->
      <section class="watermark-tool-queue" aria-labelledby="watermark-tool-queue-title">
        <div class="watermark-tool-section-header">
          <div><span class="watermark-tool-kicker">任务队列</span><h2 id="watermark-tool-queue-title">{{ tasks.length ? '待处理文件' : '等待添加文件' }}</h2></div>
          <span class="watermark-tool-count">{{ tasks.length }} 个任务</span>
        </div>
        <button type="button" class="watermark-tool-dropzone" :disabled="!desktop" aria-label="选择文件" @click="chooseFiles">
          <strong>拖入图片、GIF、MP4 或 MOV</strong>
          <span>{{ desktop ? '点击选择文件；拖入窗口也会加入队列。' : '浏览器模式不读取本地文件。' }}</span>
        </button>
        <div v-if="tasks.length" class="watermark-tool-task-list" aria-live="polite">
          <article v-for="task in tasks" :key="task.id" class="watermark-tool-task" :data-status="task.status">
            <div class="watermark-tool-task-main">
              <strong :title="task.inputPath">{{ task.name }}</strong>
              <span>{{ task.status === 'running' ? `处理中 ${Math.round(task.progress * 100)}%` : task.status === 'success' ? `已完成 · ${formatFileSize(task.outputBytes)}` : task.status === 'failed' ? task.error : task.status === 'cancelled' ? '已取消' : '等待处理' }}</span>
              <span v-if="task.outputPath" class="watermark-tool-output" :title="task.outputPath">{{ task.outputPath }}</span>
              <div v-if="task.status === 'running'" class="watermark-tool-progress"><span :style="{ width: `${task.progress * 100}%` }" /></div>
            </div>
            <button v-if="task.status !== 'running'" type="button" class="watermark-tool-icon-button" :aria-label="`移除 ${task.name}`" title="移除任务" @click="removeTask(task.id)">×</button>
          </article>
        </div>
        <div v-else class="watermark-tool-empty-state">
          <strong>队列为空</strong>
          <p>添加文件后，水印副本将写入你选择的新目录。不覆盖原文件。</p>
        </div>
        <div class="watermark-tool-status-legend" aria-label="任务状态图例"><span>等待</span><span>运行</span><span>成功</span><span>失败</span><span>取消</span></div>
      </section>

      <!-- Right: settings -->
      <aside class="watermark-tool-settings" aria-labelledby="watermark-tool-settings-title">
        <div class="watermark-tool-section-header">
          <div><span class="watermark-tool-kicker">输出设置</span><h2 id="watermark-tool-settings-title">可见水印</h2></div>
          <span class="watermark-tool-engine-status">{{ engine.ready ? '引擎已就绪' : '桌面引擎' }}</span>
        </div>
        <div class="watermark-tool-form">
          <label><span>水印类型</span><select v-model="options.kind" :disabled="!desktop || Boolean(activeTaskId)" aria-label="水印类型"><option value="text">文字水印</option><option value="image">Logo / 图片水印</option></select></label>
          <label v-if="options.kind === 'text'"><span>水印文字</span><input v-model="options.text" :disabled="!desktop || Boolean(activeTaskId)" aria-label="水印文字" /></label>
          <label v-else><span>水印图片</span><button type="button" class="watermark-tool-directory" :disabled="!desktop || Boolean(activeTaskId)" title="选择 Logo 或图片水印" @click="chooseWatermarkImage">{{ options.imagePath || '选择 Logo 或图片水印' }}</button></label>
          <label><span>位置</span><select v-model="options.position" :disabled="!desktop || Boolean(activeTaskId)" aria-label="水印位置">
            <option value="top-left">左上</option><option value="top-center">顶部居中</option><option value="top-right">右上</option>
            <option value="bottom-left">左下</option><option value="bottom-center">底部居中</option><option value="bottom-right">右下</option>
          </select></label>
          <label><span>大小</span><input v-model.number="options.sizePercent" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="1" max="90" step="1" aria-label="水印大小百分比" /></label>
          <label><span>透明度</span><input v-model.number="options.opacity" :disabled="!desktop || Boolean(activeTaskId)" type="number" min="0" max="1" step="0.05" aria-label="水印透明度" /></label>
          <label><span>铺满画面</span><select v-model="options.tiled" :disabled="!desktop || Boolean(activeTaskId)" aria-label="平铺水印"><option :value="false">单个</option><option :value="true">平铺</option></select></label>
          <label><span>输出目录</span><button type="button" class="watermark-tool-directory" :disabled="!desktop || Boolean(activeTaskId)" :title="options.outputDirectory || '选择输出文件夹'" @click="chooseOutputDirectory">{{ options.outputDirectory || '选择输出文件夹' }}</button></label>
        </div>
        <div class="watermark-tool-engine-note" :class="{ ready: engine.ready }" role="status">
          <strong>{{ engine.ready ? '可见水印已就绪' : desktop ? '转换引擎不可用' : '真实处理仅桌面可用' }}</strong>
          <span>{{ engine.message }}</span>
        </div>
        <p v-if="message" class="watermark-tool-engine-message">{{ message }}</p>
        <button v-if="runningTask" type="button" class="watermark-tool-cancel" @click="cancelActiveTask">取消当前处理</button>
        <button v-else type="button" class="watermark-tool-start" :disabled="!canStart" @click="startNextTask">开始添加水印</button>
        <button v-if="tasks.some((t) => t.status === 'failed' || t.status === 'cancelled') && !runningTask" type="button" class="watermark-tool-clean" @click="resetFailedOrCancelled">清理失败与取消任务</button>
        <p class="watermark-tool-engine-message">不覆盖输入文件；重名输出自动追加序号。</p>
      </aside>
    </div>

    <!-- Tool switch confirm dialog -->
    <div v-if="showSwitchConfirm" class="watermark-tool-modal-overlay" @click.self="cancelToolSwitch">
      <div class="watermark-tool-confirm-dialog" role="alertdialog" aria-label="切换工具确认">
        <template v-if="switchConfirmRunning">
          <p><strong>当前仍有任务正在处理。</strong></p>
          <p>切换工具将取消当前任务并清空操作。</p>
        </template>
        <template v-else>
          <p><strong>切换工具后，当前导入文件、参数设置和未保存操作将被清空。</strong></p>
          <p>已经导出的文件不会被删除。</p>
        </template>
        <div class="watermark-tool-confirm-actions">
          <button type="button" class="watermark-tool-confirm-cancel" @click="cancelToolSwitch">{{ switchConfirmRunning ? '继续处理' : '取消' }}</button>
          <button type="button" class="watermark-tool-confirm-proceed" @click="confirmToolSwitch">{{ switchConfirmRunning ? '取消任务并切换' : '清空并切换' }}</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* styles will be in watermarkTool.css */
</style>
