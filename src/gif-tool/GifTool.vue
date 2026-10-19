<script setup lang="ts">
import PreviewViewport from '../components/PreviewViewport.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { isRevealableOutputPath } from '../platform/fileSystem';
import {
  GIF_COMPUTE_CANCELLED_MESSAGE,
  type ComputedGifResult,
  type MediaTaskEvent,
} from '../gif-media/mediaTypes';
import {
  clampProgress,
  clampRange,
  formatFileSize,
  formatSeconds,
  GIF_MODE_ORDER,
  GIF_MODES,
  HARD_LIMIT_BYTES,
  HARD_LIMIT_LABEL,
  MIN_SEGMENT_DURATION,
  modePreset,
  presetMinWidth,
  TARGET_FILE_BYTES,
  type GifMode,
  type MediaEngineStatus,
  type MediaProbeResult,
} from './types';
import { toAssetUrl } from './assetUrl';

// This entry ships single-video conversion only. Multi-language template
// composition has its own entry ("批量模板 GIF 合成器").

// ---- desktop bridge ----
const desktop = ref(false);
const api = ref<any>();
const engine = ref<MediaEngineStatus>({ ready: false, message: '正在检查内置转换引擎…' });
const message = ref('');

// ---- source material ----
const sourcePath = ref('');
const probe = ref<MediaProbeResult>();
const sourceName = computed(() => {
  const normalized = sourcePath.value.replace(/\\/g, '/');
  return normalized.split('/').at(-1) || '';
});
const hasSource = computed(() => sourcePath.value !== '');
/** 官方 asset 协议 URL；授权在 Rust 的 probe_media / 计算结果发布时按单文件授予。 */
const videoSrc = computed(() => (desktop.value && sourcePath.value ? toAssetUrl(sourcePath.value) : ''));
const timelineDuration = computed(() => probe.value?.duration ?? 0);

// ---- original video playback (the blue control area drives it) ----
const videoEl = ref<HTMLVideoElement>();
const videoStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const videoError = ref('');
const playing = ref(false);
const playError = ref('');

// ---- timeline / trim range ----
const timelineStart = ref(0);
const timelineEnd = ref(0);
const playheadSeconds = ref(0);
const dragging = ref<'none' | 'playhead' | 'start' | 'end'>('none');

// ---- output intent (right panel) ----
const mode = ref<GifMode>('balanced');
const fps = ref(GIF_MODES.balanced.fps);
const customWidth = ref<number>();
const customMinWidth = ref<number>();

/**
 * 内容版本：换素材、改截取范围、改倾向/帧率/尺寸时递增。
 * 播放、暂停、移动播放头、缩放平移 **不** 递增；它决定计算结果是否仍然有效。
 */
const contentRevision = ref(0);

// ---- computed GIF result (the one and only main preview) ----
const computedGif = ref<ComputedGifResult>();
const computedRevision = ref(0);
const computedUrl = ref('');
const previewError = ref('');
/** 图片加载后校正真实尺寸；FFprobe 读不到时用它兜底。 */
const previewNatural = ref<{ width: number; height: number }>();
const computing = ref(false);
const computeProgress = ref(0);
const computeTaskId = ref('');
/** 已点击取消、原计算 Promise 尚未结束的 taskId 集合（非响应式，仅逻辑用）。 */
const cancellingTaskIds = new Set<string>();
/** 当前处于「取消中」的 taskId：任务真正结束前保持状态，避免并行启动下一次编码。 */
const cancellingTaskId = ref('');
const computeError = ref('');
const computeNotice = ref('');
/** 失败事件里的具体原因（命令本身只返回通用失败）。 */
const failureMessage = ref('');

// ---- save stage ----
const saving = ref(false);
const saveError = ref('');
const saveMessage = ref('');
const savedPath = ref('');
/** 只缓存成功选择的导出目录；用户取消时不缓存。 */
let outputDirectory = '';

// ---- generation tokens ----
let mediaGeneration = 0;
let computeTicket = 0;
let unmounted = false;

// ---- confirm dialog (return / replace while computing) ----
const dialog = ref<'none' | 'return' | 'replace'>('none');
let pendingReplacePath = '';

// ---- event listeners ----
let unlistenTaskEvents: (() => void) | undefined;
let unlistenDroppedPaths: (() => void) | undefined;

// ---- computed: intents ----
const currentPreset = computed(() => modePreset(mode.value));
const modePresets = GIF_MODE_ORDER.map((id) => ({ ...GIF_MODES[id], id }));
const presetFpsOptions = computed(() => currentPreset.value.fpsOptions);
const showsCustomSize = computed(() => mode.value === 'custom');
/** 预设倾向不传宽度，由后端同源采样选择；只有自定义发送用户宽度。 */
const expectedWidth = computed(() => (mode.value === 'custom' ? customWidth.value : undefined));
const minimumWidth = computed(() => {
  if (mode.value === 'custom') return customMinWidth.value;
  const width = probe.value?.width;
  return width ? presetMinWidth(mode.value, width) : undefined;
});

// ---- computed: result state ----
const resultStale = computed(() => Boolean(computedGif.value) && computedRevision.value !== contentRevision.value);
const resultDimensions = computed(() => {
  if (previewNatural.value) return previewNatural.value;
  const gif = computedGif.value;
  return {
    width: Math.max(1, gif?.width || 1),
    height: Math.max(1, gif?.height || 1),
  };
});
const canCompute = computed(
  () => desktop.value && engine.value.ready && hasSource.value && !computing.value
);
const canSave = computed(
  () => Boolean(computedGif.value) && !resultStale.value && !saving.value && !computing.value
);
const cancelling = computed(() => Boolean(cancellingTaskId.value));
const computeDisabled = computed(() => (cancelling.value ? true : !computing.value && !canCompute.value));
const computeLabel = computed(() => {
  if (cancelling.value) return '取消中…';
  if (computing.value) return '取消计算';
  if (computeError.value) return '重试计算';
  if (computedGif.value) return '重新计算';
  return '计算 GIF';
});
const hasUnsavedWork = computed(() => hasSource.value);

// ---- timeline geometry ----
function percentOf(seconds: number): string {
  const duration = timelineDuration.value;
  if (!duration) return '0%';
  return `${Math.max(0, Math.min(100, (seconds / duration) * 100))}%`;
}
function playheadPercent(): string {
  return percentOf(playheadSeconds.value);
}
function selectionStyle(): { left: string; width: string } {
  const duration = timelineDuration.value;
  if (!duration) return { left: '0%', width: '0%' };
  const start = Math.max(0, timelineStart.value);
  const end = Math.min(duration, timelineEnd.value);
  return { left: percentOf(start), width: `${Math.max(0, ((end - start) / duration) * 100)}%` };
}

// ---- original video playback ----
function seekVideoTo(seconds: number) {
  const el = videoEl.value;
  if (!el) return;
  const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : timelineDuration.value;
  const target = Math.max(0, Math.min(seconds, Math.max(0, duration - 0.01)));
  if (!Number.isFinite(target)) return;
  if (Math.abs(el.currentTime - target) < 0.01) return;
  try {
    el.currentTime = target;
  } catch {
    // 播放器尚未可定位；loadedmetadata 后会再同步一次。
  }
}

function onVideoLoadedMetadata() {
  videoStatus.value = 'ready';
  videoError.value = '';
  seekVideoTo(playheadSeconds.value);
}

/** 播放时同步播放头；到达片段终点后暂停，不触发编码、不使结果过期。 */
function onVideoTimeUpdate() {
  const el = videoEl.value;
  if (!el) return;
  if (dragging.value === 'none') playheadSeconds.value = el.currentTime;
  if (playing.value && timelineEnd.value > timelineStart.value && el.currentTime >= timelineEnd.value - 0.03) {
    el.pause();
    playing.value = false;
  }
}

function onVideoPlay() {
  playing.value = true;
  playError.value = '';
}

function onVideoPause() {
  playing.value = false;
}

function onVideoSeeked() {
  const el = videoEl.value;
  if (!el) return;
  playheadSeconds.value = el.currentTime;
}

function onVideoError() {
  videoStatus.value = 'error';
  videoError.value = '原片预览加载失败：文件可能已被移动、删除或未获得读取授权；不影响计算与保存。';
}

function togglePlayback() {
  const el = videoEl.value;
  if (!el || !timelineDuration.value) return;
  if (playing.value) {
    el.pause();
    return;
  }
  // 片段播放规则：位置在选区外时从起点开始；到终点暂停后再次播放也从起点开始。
  if (el.currentTime < timelineStart.value - 0.02 || el.currentTime >= timelineEnd.value - 0.02) {
    seekVideoTo(timelineStart.value);
    playheadSeconds.value = timelineStart.value;
  }
  try {
    const played = el.play();
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        playError.value = '无法播放原片：请确认文件仍可访问，或稍后重试。';
        playing.value = false;
      });
    }
  } catch {
    playError.value = '无法播放原片：请确认文件仍可访问，或稍后重试。';
    playing.value = false;
  }
}

// ---- content invalidation (only real content changes) ----
/**
 * 参数 / 素材变化：让已计算结果过期（保留画面但禁止保存），并取消正在进行的计算。
 * 播放、暂停、移动播放头、缩放平移都不调用它。
 */
function invalidateContent() {
  contentRevision.value += 1;
  computeNotice.value = '';
  // 旧结果的保存反馈不能挂在新参数上。
  saveError.value = '';
  saveMessage.value = '';
  savedPath.value = '';
  if (computing.value) void cancelCompute();
}

function movePlayhead(seconds: number) {
  const duration = timelineDuration.value;
  if (!duration) return;
  playheadSeconds.value = Math.max(0, Math.min(seconds, duration));
  seekVideoTo(playheadSeconds.value);
}

function setRangeStart(seconds: number) {
  const duration = timelineDuration.value;
  if (!duration) return;
  const start = Math.max(0, Math.min(seconds, timelineEnd.value - MIN_SEGMENT_DURATION));
  timelineStart.value = start;
  movePlayhead(start);
  invalidateContent();
}

function setRangeEnd(seconds: number) {
  const duration = timelineDuration.value;
  if (!duration) return;
  const end = Math.max(timelineStart.value + MIN_SEGMENT_DURATION, Math.min(seconds, duration));
  timelineEnd.value = end;
  movePlayhead(end);
  invalidateContent();
}

function secondsFromEvent(event: PointerEvent, element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const frac = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
  return frac * timelineDuration.value;
}

function onTimelinePointerDown(event: PointerEvent) {
  if (!timelineDuration.value) return;
  const element = event.currentTarget as HTMLElement;
  movePlayhead(secondsFromEvent(event, element));
  dragging.value = 'playhead';
  event.preventDefault();
  element.setPointerCapture?.(event.pointerId);
}

function onTimelinePointerMove(event: PointerEvent) {
  if (dragging.value === 'none') return;
  const element = event.currentTarget as HTMLElement;
  const seconds = secondsFromEvent(event, element);
  if (dragging.value === 'playhead') movePlayhead(seconds);
  else if (dragging.value === 'start') setRangeStart(seconds);
  else if (dragging.value === 'end') setRangeEnd(seconds);
}

function endTimelineDrag() {
  dragging.value = 'none';
}

function onStartHandleDown(event: PointerEvent) {
  if (!timelineDuration.value) return;
  dragging.value = 'start';
  event.stopPropagation();
  event.preventDefault();
  (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onEndHandleDown(event: PointerEvent) {
  if (!timelineDuration.value) return;
  dragging.value = 'end';
  event.stopPropagation();
  event.preventDefault();
  (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
}

/** 时间轴键盘操作：方向键移动播放头；Shift/⌘ 分别调节起点/终点。 */
function onTimelineKeydown(event: KeyboardEvent) {
  if (!timelineDuration.value) return;
  const step = event.shiftKey || event.metaKey || event.ctrlKey ? 0.5 : 0.1;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? step : -step;
    if (event.metaKey || event.ctrlKey) setRangeEnd(timelineEnd.value + delta);
    else if (event.shiftKey) setRangeStart(timelineStart.value + delta);
    else movePlayhead(playheadSeconds.value + delta);
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    movePlayhead(timelineStart.value);
  }
}

function onStartInputChange(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) setRangeStart(value);
}

function onEndInputChange(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) setRangeEnd(value);
}

function resetRange() {
  if (!timelineDuration.value) return;
  const range = clampRange(0, timelineDuration.value, timelineDuration.value);
  timelineStart.value = range.startSeconds;
  timelineEnd.value = range.endSeconds;
  movePlayhead(timelineStart.value);
  invalidateContent();
}

// ---- intent / parameter changes ----
function setMode(next: GifMode) {
  if (mode.value === next) return;
  mode.value = next;
  fps.value = modePreset(next).fps;
  if (next === 'custom' && customWidth.value === undefined && probe.value) {
    customWidth.value = probe.value.width;
  }
  invalidateContent();
}

function setFps(next: number) {
  if (!Number.isFinite(next) || next === fps.value) return;
  fps.value = Math.max(1, Math.min(60, Math.round(next)));
  invalidateContent();
}

function onFpsInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) setFps(value);
}

function onWidthInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === '') {
    customWidth.value = undefined;
    invalidateContent();
    return;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return;
  customWidth.value = Math.round(value);
  invalidateContent();
}

function onMinWidthInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === '') {
    customMinWidth.value = undefined;
    invalidateContent();
    return;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return;
  customMinWidth.value = Math.round(value);
  invalidateContent();
}

// ---- desktop API ----
async function discardResult(taskId: string | undefined) {
  if (!taskId || !api.value) return;
  try {
    await api.value.discardComputedGif(taskId);
  } catch {
    // 结果可能已被清理；丢弃失败不影响新流程。
  }
}

function clearComputedResult() {
  const previous = computedGif.value;
  computedGif.value = undefined;
  computedRevision.value = 0;
  computedUrl.value = '';
  previewError.value = '';
  previewNatural.value = undefined;
  computeError.value = '';
  computeNotice.value = '';
  failureMessage.value = '';
  saveError.value = '';
  saveMessage.value = '';
  savedPath.value = '';
  if (previous) void discardResult(previous.taskId);
}

async function cancelCompute(taskId: string = computeTaskId.value) {
  if (!taskId || !api.value) return;
  // 先记取消意图：即使 cancel 调用本身失败，原任务晚到的成功结果也不能显示。
  cancellingTaskIds.add(taskId);
  cancellingTaskId.value = taskId;
  try {
    await api.value.cancelTask(taskId);
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error);
  }
}

function handleTaskEvent(event: MediaTaskEvent) {
  // 只消费本次计算任务的进度；终态以命令返回值为准，避免双写状态。
  if (event.kind === 'progress' && event.taskId === computeTaskId.value) {
    computeProgress.value = clampProgress(event.progress);
    return;
  }
  if (event.kind === 'failed' && event.taskId === computeTaskId.value) {
    failureMessage.value = event.message;
  }
}

// ---- material selection ----
async function pickVideo() {
  if (!api.value || !desktop.value) return;
  try {
    const paths = await api.value.pickMediaFiles();
    if (unmounted || !paths?.length) return;
    requestSource(paths);
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error);
  }
}

function requestSource(paths: string[]) {
  if (!paths.length) return;
  const path = paths.find((candidate) => /\.(mp4|mov)$/i.test(candidate));
  if (!path) {
    message.value = '请选择 MP4 或 MOV 文件';
    return;
  }
  if (computing.value) {
    pendingReplacePath = path;
    dialog.value = 'replace';
    return;
  }
  void applySource(path);
}

async function applySource(path: string) {
  // 换素材 = 内容变化：取消在跑计算、丢弃旧结果、暂停旧视频。
  if (computing.value) await cancelCompute();
  videoEl.value?.pause();
  playing.value = false;
  mediaGeneration += 1;
  const generation = mediaGeneration;
  sourcePath.value = path;
  probe.value = undefined;
  timelineStart.value = 0;
  timelineEnd.value = 0;
  playheadSeconds.value = 0;
  videoStatus.value = 'loading';
  videoError.value = '';
  playError.value = '';
  message.value = '';
  clearComputedResult();
  contentRevision.value += 1;
  await probeSource(path, generation);
}

async function probeSource(path: string, generation: number) {
  if (!api.value) return;
  try {
    const result = await api.value.probeMedia(path);
    if (unmounted || generation !== mediaGeneration) return;
    probe.value = result;
    timelineStart.value = 0;
    timelineEnd.value = result.duration;
    playheadSeconds.value = 0;
    if (mode.value === 'custom' && customWidth.value === undefined) {
      customWidth.value = result.width;
    }
    contentRevision.value += 1;
  } catch (error) {
    if (unmounted || generation !== mediaGeneration) return;
    message.value = error instanceof Error ? error.message : String(error);
  }
}

async function confirmReplace() {
  const path = pendingReplacePath;
  pendingReplacePath = '';
  dialog.value = 'none';
  if (path) await applySource(path);
}

// ---- compute (real GIF, no export directory needed) ----
async function computeGif() {
  if (computing.value) {
    await cancelCompute();
    return;
  }
  if (!api.value || !desktop.value || !engine.value.ready || !hasSource.value) return;

  const revision = contentRevision.value;
  const taskId = `gif-preview-${mediaGeneration}-${revision}-${Date.now()}`;
  computeTicket += 1;
  const ticket = computeTicket;
  computeTaskId.value = taskId;
  computing.value = true;
  computeProgress.value = 0;
  computeError.value = '';
  computeNotice.value = '';
  failureMessage.value = '';
  previewError.value = '';
  previewNatural.value = undefined;
  // 旧结果文件立即作废：新结果成功前主预览显示计算进度。
  clearComputedResult();

  try {
    const result: ComputedGifResult = await api.value.computeGifPreview({
      taskId,
      inputPath: sourcePath.value,
      options: {
        startSeconds: timelineStart.value || undefined,
        endSeconds: timelineEnd.value || undefined,
        width: expectedWidth.value,
        fps: fps.value,
        preset: 'high',
        targetBytes: TARGET_FILE_BYTES,
        mode: mode.value,
        minWidth: minimumWidth.value,
      },
    });
    if (unmounted || ticket !== computeTicket) {
      void discardResult(result.taskId);
      return;
    }
    // 任务完成时代次或内容版本不匹配：结果属于旧参数，丢弃且不可保存。
    if (revision !== contentRevision.value) {
      void discardResult(result.taskId);
      computeNotice.value = '参数已变化，本次计算结果已丢弃';
      return;
    }
    // 用户已取消、但这次计算仍成功返回：不得显示或允许保存，立即清理结果文件。
    if (cancellingTaskIds.has(taskId)) {
      void discardResult(result.taskId);
      computeNotice.value = '已取消计算';
      return;
    }
    computedGif.value = result;
    computedRevision.value = revision;
    computedUrl.value = desktop.value ? toAssetUrl(result.path) : '';
    if (!computedUrl.value) {
      previewError.value = '当前环境无法预览计算结果，但仍可保存。';
    }
  } catch (error) {
    if (unmounted || ticket !== computeTicket) return;
    const text = error instanceof Error ? error.message : String(error);
    if (text === GIF_COMPUTE_CANCELLED_MESSAGE || cancellingTaskIds.has(taskId)) {
      computeNotice.value = '已取消计算';
    } else {
      computeError.value = failureMessage.value || text;
    }
  } finally {
    cancellingTaskIds.delete(taskId);
    if (cancellingTaskId.value === taskId) cancellingTaskId.value = '';
    if (!unmounted && ticket === computeTicket) {
      computing.value = false;
      computeTaskId.value = '';
      computeProgress.value = 0;
    }
  }
}

// ---- preview handlers ----
function onPreviewLoaded(event: Event) {
  const image = event.target as HTMLImageElement;
  if (!image.naturalWidth || !image.naturalHeight) {
    onPreviewError();
    return;
  }
  previewNatural.value = { width: image.naturalWidth, height: image.naturalHeight };
  previewError.value = '';
}

/** 预览失败只影响预览，不改变「结果已生成/可保存」的事实。 */
function onPreviewError() {
  previewError.value = 'GIF 预览加载失败；结果文件已生成，仍可保存。';
}

// ---- save (reuses the computed file, never re-encodes) ----
/** 保存回写前的快照校验：结果与内容版本都必须是发起保存时的那一份。 */
function isCurrentSaveTarget(taskId: string, revision: number): boolean {
  const current = computedGif.value;
  return Boolean(current) && current!.taskId === taskId && revision === contentRevision.value;
}

async function saveGif() {
  const snapshot = computedGif.value;
  if (!snapshot || !api.value || saving.value) return;
  if (computedRevision.value !== contentRevision.value) return;

  const revision = contentRevision.value;
  saving.value = true;
  saveError.value = '';
  saveMessage.value = '';
  savedPath.value = '';
  try {
    // 首次保存才选择目录；用户取消时不缓存，下次保存会重新弹出。
    if (!outputDirectory) {
      const picked = await api.value.pickOutputDirectory();
      if (!picked) return;
      outputDirectory = picked;
    }
    const current = computedGif.value;
    if (
      unmounted ||
      !current ||
      current.taskId !== snapshot.taskId ||
      revision !== contentRevision.value
    ) {
      saveError.value = '结果已变化，请重新计算后再保存';
      return;
    }
    const saved = await api.value.saveComputedGif({
      taskId: snapshot.taskId,
      directory: outputDirectory,
    });
    // 落盘可能跨过换素材/改参数：只有仍然对应当前结果时才把结果写回界面。
    if (unmounted) return;
    if (!isCurrentSaveTarget(snapshot.taskId, revision)) return;
    savedPath.value = saved.path;
    saveMessage.value = '已保存';
  } catch (error) {
    if (unmounted) return;
    // 旧素材的保存失败同样不能污染新素材的界面。
    if (!isCurrentSaveTarget(snapshot.taskId, revision)) return;
    saveError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (!unmounted) saving.value = false;
  }
}

async function revealSaved() {
  if (!savedPath.value || !isRevealableOutputPath(savedPath.value) || !api.value) return;
  try {
    await api.value.revealOutputFile(savedPath.value);
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  }
}

// ---- return to toolbox ----
function requestReturn() {
  if (hasUnsavedWork.value || computing.value) {
    dialog.value = 'return';
    return;
  }
  confirmReturn();
}

async function confirmReturn() {
  dialog.value = 'none';
  if (computing.value) await cancelCompute();
  videoEl.value?.pause();
  clearComputedResult();
  window.dispatchEvent(new CustomEvent('gif-tool-confirmed-return'));
}

// ---- lifecycle ----
/** React 页面标题栏的「返回工具箱」发来请求；由本工具决定确认/直接退出。 */
function onRequestReturn() {
  requestReturn();
}

watch(videoSrc, (value) => {
  if (!value) {
    videoStatus.value = 'idle';
    playing.value = false;
  } else if (videoStatus.value !== 'ready') {
    videoStatus.value = 'loading';
  }
  videoError.value = '';
});

onMounted(async () => {
  // 页面标题栏的返回请求与引擎是否可用无关，先注册，保证任何状态下都能退出。
  window.addEventListener('gif-tool-request-return', onRequestReturn);
  try {
    const mediaDesktop = await import('../gif-media/mediaDesktop');
    if (unmounted) return;
    if (!mediaDesktop.isMediaDesktopAvailable()) {
      engine.value = { ready: false, message: '当前环境无法连接桌面转换能力，请使用桌面应用。' };
      return;
    }
    desktop.value = true;
    const loaded = await mediaDesktop.loadMediaDesktopApi();
    if (unmounted) return;
    api.value = loaded;

    // 每次 await 后都检查卸载：晚到的监听器必须立即解除，不能留在旧页面上。
    const stopTaskEvents = await loaded.listenTaskEvents(handleTaskEvent);
    if (unmounted) {
      stopTaskEvents();
      return;
    }
    unlistenTaskEvents = stopTaskEvents;

    const stopDroppedPaths = await loaded.listenDroppedPaths((paths: string[]) => {
      if (unmounted) return;
      requestSource(paths);
    });
    if (unmounted) {
      stopDroppedPaths();
      return;
    }
    unlistenDroppedPaths = stopDroppedPaths;

    const status = await loaded.getEngineStatus();
    if (unmounted) return;
    engine.value = status;
  } catch (error) {
    if (unmounted) return;
    engine.value = {
      ready: false,
      message: error instanceof Error ? error.message : '内置转换引擎不可用',
    };
  }
});

onUnmounted(() => {
  unmounted = true;
  computeTicket += 1;
  // 卸载时取消仍在运行的任务：不能把正在跑的 FFmpeg 留在后台写临时结果。
  const activeTaskId = computeTaskId.value;
  if (activeTaskId) {
    cancellingTaskIds.add(activeTaskId);
    cancellingTaskId.value = activeTaskId;
    if (api.value) {
      try {
        void api.value.cancelTask(activeTaskId);
      } catch {
        // 已卸载时取消失败没有可展示的界面，任务由后端超时/进程退出兜底。
      }
    }
  }
  computing.value = false;
  computeTaskId.value = '';
  cancellingTaskId.value = '';
  cancellingTaskIds.clear();
  videoEl.value?.pause();
  clearComputedResult();
  unlistenTaskEvents?.();
  unlistenDroppedPaths?.();
  unlistenTaskEvents = undefined;
  unlistenDroppedPaths = undefined;
  window.removeEventListener('gif-tool-request-return', onRequestReturn);
});
</script>

<template>
  <main class="gif-tool" aria-label="视频转 GIF">
    <header class="gif-tool-toolbar">
      <button
        type="button"
        class="gif-tool-secondary gif-tool-import"
        :disabled="!desktop || !engine.ready"
        @click="pickVideo"
      >
        {{ hasSource ? '更换视频' : '导入视频' }}
      </button>
      <span v-if="hasSource" class="gif-tool-filename" :title="sourcePath">{{ sourceName }}</span>
      <span v-else class="gif-tool-filename is-muted">尚未导入视频</span>
      <span class="gif-tool-engine" :class="{ 'is-ready': engine.ready, 'is-error': !engine.ready }" role="status">
        {{ engine.message }}
      </span>
      <span v-if="message" class="gif-tool-message" role="status">{{ message }}</span>
    </header>

    <section class="gif-workspace" aria-label="GIF 工作区">
      <section class="gif-preview" aria-label="GIF 结果预览">
        <div class="gif-preview-stage">
          <PreviewViewport
            v-if="computedGif && computedUrl"
            :key="computedGif.taskId"
            :width="resultDimensions.width"
            :height="resultDimensions.height"
            label="GIF 结果"
          >
            <img
              :src="computedUrl"
              alt="计算得到的 GIF 结果"
              class="gif-preview-image"
              draggable="false"
              @load="onPreviewLoaded"
              @error="onPreviewError"
            />
          </PreviewViewport>

          <div v-else-if="computing" class="gif-preview-state">
            <strong>{{ cancelling ? '正在取消计算…' : '正在计算 GIF…' }}</strong>
            <div
              class="gif-progress"
              role="progressbar"
              aria-label="计算进度"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="Math.round(computeProgress * 100)"
            >
              <span :style="{ width: `${Math.max(3, Math.round(computeProgress * 100))}%` }"></span>
            </div>
            <span class="gif-preview-hint">先做短样本预算，再完整编码所选片段；可以随时取消。</span>
            <button type="button" class="gif-tool-secondary" :disabled="cancelling" @click="cancelCompute()">
              {{ cancelling ? '取消中…' : '取消计算' }}
            </button>
          </div>

          <div v-else-if="computeError" class="gif-preview-state is-error" role="alert">
            <strong>计算失败</strong>
            <span class="gif-preview-hint">{{ computeError }}</span>
            <span class="gif-preview-hint">调整参数或片段后可以重试；不会写入导出目录。</span>
          </div>

          <div v-else-if="!hasSource" class="gif-preview-state">
            <strong>导入一个视频开始</strong>
            <span class="gif-preview-hint">单视频、单片段；支持 MP4 / MOV，本地处理、不上传。</span>
            <button
              type="button"
              class="gif-tool-primary"
              :disabled="!desktop || !engine.ready"
              @click="pickVideo"
            >
              导入视频
            </button>
          </div>

          <div v-else class="gif-preview-state">
            <strong>选择片段后，点击计算 GIF 查看结果</strong>
            <span class="gif-preview-hint">计算只做真实编码，不会写入导出目录；结果确认后再保存。</span>
          </div>

          <span v-if="computedGif && resultStale" class="gif-preview-badge is-stale" role="status">
            结果已过期，请重新计算
          </span>
          <span v-else-if="computedGif && previewError" class="gif-preview-badge is-error" role="status">
            {{ previewError }}
          </span>
        </div>
      </section>

      <section class="gif-transport" aria-label="原片与截取">
        <div class="gif-transport-thumb">
          <video
            v-if="videoSrc"
            ref="videoEl"
            class="gif-transport-video"
            :src="videoSrc"
            preload="metadata"
            playsinline
            @loadedmetadata="onVideoLoadedMetadata"
            @timeupdate="onVideoTimeUpdate"
            @play="onVideoPlay"
            @pause="onVideoPause"
            @seeked="onVideoSeeked"
            @error="onVideoError"
          ></video>
          <div v-else class="gif-transport-video is-empty">未导入视频</div>
          <span class="gif-transport-caption">
            原片 · {{ formatSeconds(timelineDuration) }}
            <template v-if="videoStatus === 'loading'"> · 加载中</template>
            <template v-else-if="videoStatus === 'error'"> · 无法预览</template>
          </span>
        </div>

        <div class="gif-transport-controls">
          <div
            class="gif-timeline"
            :class="{ 'is-disabled': !timelineDuration }"
            role="slider"
            tabindex="0"
            aria-label="原片时间轴"
            :aria-valuemin="0"
            :aria-valuemax="Math.max(0, timelineDuration)"
            :aria-valuenow="Math.round(playheadSeconds * 10) / 10"
            @pointerdown="onTimelinePointerDown"
            @pointermove="onTimelinePointerMove"
            @pointerup="endTimelineDrag"
            @pointercancel="endTimelineDrag"
            @lostpointercapture="endTimelineDrag"
            @keydown="onTimelineKeydown"
          >
            <div class="gif-timeline-track">
              <span class="gif-timeline-selection" :style="selectionStyle()"></span>
              <span class="gif-timeline-playhead" :style="{ left: playheadPercent() }"></span>
              <button
                type="button"
                class="gif-timeline-handle is-start"
                :style="{ left: percentOf(timelineStart) }"
                aria-label="截取起点"
                @pointerdown="onStartHandleDown"
              ></button>
              <button
                type="button"
                class="gif-timeline-handle is-end"
                :style="{ left: percentOf(timelineEnd) }"
                aria-label="截取终点"
                @pointerdown="onEndHandleDown"
              ></button>
            </div>
          </div>

          <div class="gif-transport-row">
            <button
              type="button"
              class="gif-transport-play"
              :disabled="!timelineDuration"
              :aria-label="playing ? '暂停原片' : '播放选中片段'"
              @click="togglePlayback"
            >
              {{ playing ? '暂停' : '播放' }}
            </button>
            <span class="gif-transport-meta">
              <span>{{ formatSeconds(playheadSeconds) }} / {{ formatSeconds(timelineDuration) }}</span>
              <span>选中 {{ formatSeconds(Math.max(0, timelineEnd - timelineStart)) }}</span>
            </span>
            <button
              type="button"
              class="gif-tool-primary gif-transport-compute"
              :disabled="computeDisabled"
              @click="computeGif"
            >
              {{ computeLabel }}
            </button>
          </div>

          <div class="gif-transport-range">
            <label>
              开始
              <input
                type="number"
                inputmode="decimal"
                step="0.1"
                min="0"
                :max="Math.max(0, timelineEnd - MIN_SEGMENT_DURATION)"
                :value="timelineStart.toFixed(1)"
                aria-label="截取开始秒数"
                @change="onStartInputChange"
              />
            </label>
            <label>
              结束
              <input
                type="number"
                inputmode="decimal"
                step="0.1"
                :min="timelineStart + MIN_SEGMENT_DURATION"
                :max="timelineDuration"
                :value="timelineEnd.toFixed(1)"
                aria-label="截取结束秒数"
                @change="onEndInputChange"
              />
            </label>
            <button type="button" class="gif-tool-link" @click="resetRange">重置片段</button>
            <span class="gif-transport-hint">方向键移动播放头；Shift+方向键调节起点；⌘/Ctrl+方向键调节终点</span>
          </div>

          <p v-if="computeNotice || playError || videoError" class="gif-transport-note" role="status">
            {{ computeNotice || playError || videoError }}
          </p>
        </div>
      </section>
    </section>

    <aside class="gif-tool-settings" aria-label="GIF 输出设置">
      <section class="gif-settings-block">
        <h2>输出倾向</h2>
        <div class="gif-tool-mode-presets" role="radiogroup" aria-label="输出倾向">
          <button
            v-for="preset in modePresets"
            :key="preset.id"
            type="button"
            role="radio"
            :aria-checked="mode === preset.id"
            :class="{ 'is-active': mode === preset.id }"
            @click="setMode(preset.id)"
          >
            {{ preset.label }}
          </button>
        </div>
        <p class="gif-settings-summary">{{ currentPreset.summary }}</p>
        <p class="gif-settings-line">上限 {{ HARD_LIMIT_LABEL }}；无法保证任意视频都能压到该上限。</p>
      </section>

      <section class="gif-settings-block">
        <h2>帧率</h2>
        <input
          v-if="showsCustomSize"
          class="gif-settings-input"
          type="number"
          min="1"
          max="60"
          step="1"
          :value="fps"
          aria-label="自定义帧率"
          @change="onFpsInput"
        />
        <div v-else class="gif-settings-choices" role="radiogroup" aria-label="帧率">
          <button
            v-for="option in presetFpsOptions"
            :key="option"
            type="button"
            role="radio"
            :aria-checked="fps === option"
            :class="{ 'is-active': fps === option }"
            @click="setFps(option)"
          >
            {{ option }} fps
          </button>
        </div>
        <p class="gif-settings-line is-muted">帧率是硬约束，压缩过程不会改动它。</p>
      </section>

      <section class="gif-settings-block">
        <h2>输出尺寸</h2>
        <p v-if="!showsCustomSize" class="gif-settings-line">尺寸自动调整，计算后查看实际结果。</p>
        <template v-else>
          <label class="gif-settings-field">
            输出宽度
            <input
              class="gif-settings-input"
              type="number"
              min="1"
              max="8192"
              :value="customWidth ?? ''"
              placeholder="自动"
              aria-label="输出宽度"
              @change="onWidthInput"
            />
          </label>
          <label class="gif-settings-field">
            最低宽度
            <input
              class="gif-settings-input"
              type="number"
              min="1"
              max="8192"
              :value="customMinWidth ?? ''"
              placeholder="自动"
              aria-label="最低允许宽度"
              @change="onMinWidthInput"
            />
          </label>
        </template>
      </section>

      <section class="gif-settings-block">
        <h2>当前结果</h2>
        <p v-if="!hasSource" class="gif-settings-line is-muted">尚未导入视频</p>
        <p v-else-if="computing" class="gif-settings-line">正在计算… {{ Math.round(computeProgress * 100) }}%</p>
        <p v-else-if="computeError" class="gif-settings-line is-error">{{ computeError }}</p>
        <p v-else-if="computedGif && resultStale" class="gif-settings-line is-warning">
          结果已过期，保存已禁用；请重新计算。
        </p>
        <template v-else-if="computedGif">
          <p class="gif-settings-line">
            实际尺寸：{{ resultDimensions.width }}×{{ resultDimensions.height }}
          </p>
          <p class="gif-settings-line">实际体积：{{ formatFileSize(computedGif.bytes) }}</p>
          <p class="gif-settings-line">
            片段：{{ formatSeconds(computedGif.startSeconds) }}–{{ formatSeconds(computedGif.endSeconds) }}
            （{{ formatSeconds(computedGif.durationSeconds) }}，设置 {{ computedGif.fps }} fps）
          </p>
          <p v-if="previewError" class="gif-settings-line is-warning">{{ previewError }}</p>
        </template>
        <p v-else class="gif-settings-line is-muted">还没有计算结果</p>
      </section>

      <section class="gif-settings-block">
        <button type="button" class="gif-tool-primary gif-settings-save" :disabled="!canSave" @click="saveGif">
          {{ saving ? '正在保存…' : '保存 GIF' }}
        </button>
        <div class="gif-settings-feedback" role="status">
          <span v-if="saveMessage">{{ saveMessage }}</span>
          <button
            v-if="savedPath && isRevealableOutputPath(savedPath)"
            type="button"
            class="gif-tool-link"
            @click="revealSaved"
          >
            显示位置
          </button>
          <span v-if="saveError" class="is-error">{{ saveError }}</span>
          <span v-if="savedPath" class="gif-saved-path" :title="savedPath">{{ savedPath }}</span>
        </div>
        <p class="gif-settings-hint">保存只复制已计算结果，不会重新编码；重名自动追加序号，不覆盖已有文件。</p>
      </section>

      <details class="gif-settings-help">
        <summary>计算方式说明</summary>
        <p>先用最多 2 秒的短样本估算体积，再完整编码所选片段；超限时只缩小宽度，最多两次完整编码，帧率与截取时长不会被改动。</p>
        <p>无法满足 {{ HARD_LIMIT_BYTES.toLocaleString() }} 字节上限时会明确失败，不会写出超限文件；失败、取消或参数变化后的临时结果会被清理。</p>
        <p>结果先在应用管理的临时位置计算，保存时才写入你选择的导出目录。</p>
      </details>
    </aside>

    <div v-if="dialog !== 'none'" class="gif-tool-confirm-overlay" @click.self="dialog = 'none'">
      <div
        class="gif-tool-confirm-dialog"
        role="alertdialog"
        :aria-label="dialog === 'return' ? '返回工具箱确认' : '更换视频确认'"
      >
        <template v-if="dialog === 'return'">
          <p><strong>返回工具箱会清空当前导入、参数与未保存结果。</strong></p>
          <p>已经保存到导出目录的文件不会被删除；计算结果会被清理。</p>
        </template>
        <template v-else>
          <p><strong>当前仍在计算 GIF。</strong></p>
          <p>更换视频会取消当前计算；计算结果不会写入导出目录。</p>
        </template>
        <div class="gif-tool-confirm-actions">
          <button type="button" @click="dialog = 'none'">取消</button>
          <button
            type="button"
            class="is-primary"
            @click="dialog === 'return' ? confirmReturn() : confirmReplace()"
          >
            {{ dialog === 'return' ? '清空并返回' : '取消计算并更换' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* styles live in gifTool.css */
</style>
