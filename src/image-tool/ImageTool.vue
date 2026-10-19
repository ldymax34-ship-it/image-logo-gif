<script setup lang="ts">
import PreviewViewport from '../components/PreviewViewport.vue';
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import {
  chooseOutputTarget,
  isRevealableOutputPath,
  joinNativePath,
  revealPathInFolder,
  saveBlobToOutputTarget,
  type OutputTarget,
} from '../platform/fileSystem';
import { createWorkerEncoder, type Encoder } from './encoder';
import {
  clampTargetWidth,
  clampedSourceSize,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_PNG_LEVEL,
  scaledImageHeight,
  formatImageBytes,
  formatOutputName,
  formatSpec,
  IMAGE_FORMAT_ORDER,
  isSupportedImageFile,
  MAX_SOURCE_EDGE,
  PNG_LEVEL_RANGE,
  QUALITY_RANGE,
  qualityForFormat,
  sizeChangeLabel,
  type ImageFormat,
} from './types';

type SourceState = {
  file: File;
  name: string;
  bytes: number;
  /** 实际参与编码的尺寸（超过内存上限时已等比缩小）。 */
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  clamped: boolean;
};

type OutputState = {
  bytes: Uint8Array;
  width: number;
  height: number;
  mime: string;
  /** 产生这份字节的格式；保存时用它的扩展名，不读当前格式选择器。 */
  format: ImageFormat;
  url: string;
};

const fileInput = ref<HTMLInputElement>();
const compareRef = ref<HTMLElement>();

const source = ref<SourceState>();
const sourceBitmap = shallowRef<ImageBitmap>();
const sourceUrl = ref('');
const format = ref<ImageFormat>('jpeg');
const quality = ref(DEFAULT_IMAGE_QUALITY);
const pngLevel = ref(DEFAULT_PNG_LEVEL);
const targetWidth = ref<number>();
const output = ref<OutputState>();
/**
 * 当前展示的结果是否已因参数/尺寸变化而失效。
 * 去抖等待、编码进行中、编码失败三个阶段都必须为 true，保证旧结果不可保存；
 * 只有新结果真正回来后才恢复为 false。
 */
const outputStale = ref(false);
const encoding = ref(false);
const error = ref('');
const comparePercent = ref(50);
const comparing = ref(false);
const saving = ref(false);
const saveError = ref('');
const saveMessage = ref('');
const savedPath = ref('');

const encoder = shallowRef<Encoder>();
let outputTarget: OutputTarget | undefined;
let outputUrlToRevoke = '';
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
/** 任何素材/参数变化都会递增；晚到的旧编码结果不能覆盖新状态。 */
let generation = 0;
let unmounted = false;

const supportsQuality = computed(() => formatSpec(format.value).supportsQuality);
const formatOptions = IMAGE_FORMAT_ORDER.map((id) => formatSpec(id));
const layout = computed(() => {
  const src = source.value;
  if (!src) return undefined;
  const width = clampTargetWidth(targetWidth.value, src.width) ?? src.width;
  return { width, height: scaledImageHeight(src.width, src.height, width) };
});
const outputSizeLabel = computed(() => {
  const src = source.value;
  const out = output.value;
  if (!src || !out) return '';
  return `${formatImageBytes(src.bytes)} → ${formatImageBytes(out.bytes.length)}（${sizeChangeLabel(src.bytes, out.bytes.length)}）`;
});
const formatNote = computed(() => formatSpec(format.value).note);
const wideNote = computed(() => {
  const src = source.value;
  if (!src?.clamped) return '';
  return `原图 ${src.originalWidth}×${src.originalHeight} 超过 ${MAX_SOURCE_EDGE}px 处理上限，已按最长边 ${MAX_SOURCE_EDGE}px 载入。`;
});

function openPicker() {
  fileInput.value?.click();
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void loadFile(file);
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
}

function releaseSource() {
  if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value);
  sourceUrl.value = '';
  sourceBitmap.value?.close();
  sourceBitmap.value = undefined;
}

function releaseOutput() {
  if (outputUrlToRevoke) URL.revokeObjectURL(outputUrlToRevoke);
  outputUrlToRevoke = '';
}

async function loadFile(file: File) {
  if (!isSupportedImageFile(file)) {
    error.value = '只支持 JPEG / PNG / WebP 图片';
    return;
  }

  generation += 1;
  const ticket = generation;
  if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  debounceTimer = undefined;

  encoding.value = false;
  error.value = '';
  saveError.value = '';
  saveMessage.value = '';
  savedPath.value = '';
  releaseOutput();
  output.value = undefined;
  outputStale.value = true;
  releaseSource();
  source.value = undefined;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (!unmounted && ticket === generation) error.value = '无法读取该图片，请换用 JPEG / PNG / WebP 文件';
    return;
  }
  if (unmounted || ticket !== generation) {
    bitmap.close();
    return;
  }

  const box = clampedSourceSize(bitmap.width, bitmap.height);
  sourceBitmap.value = bitmap;
  source.value = {
    file,
    name: file.name,
    bytes: file.size,
    width: box.width,
    height: box.height,
    originalWidth: bitmap.width,
    originalHeight: bitmap.height,
    clamped: box.clamped,
  };
  sourceUrl.value = URL.createObjectURL(file);
  targetWidth.value = undefined;
  comparePercent.value = 50;
  void encodeNow(ticket);
}

function ensureEncoder(): Encoder {
  if (!encoder.value) encoder.value = createWorkerEncoder();
  return encoder.value;
}

function drawImageData(bitmap: ImageBitmap, width: number, height: number): ArrayBuffer {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建图片画布');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data.buffer as ArrayBuffer;
}

function applyOutput(
  result: { bytes: Uint8Array; width: number; height: number; mime: string },
  formatUsed: ImageFormat
) {
  releaseOutput();
  const blob = new Blob([result.bytes as unknown as BlobPart], { type: result.mime });
  const url = URL.createObjectURL(blob);
  outputUrlToRevoke = url;
  output.value = { ...result, format: formatUsed, url };
  outputStale.value = false;
}

/**
 * 参数或尺寸一变就让旧结果失效：预览可以继续显示，但保存按钮立即禁用，
 * 直到这一轮新编码成功。去抖、编码中、编码失败都靠这个标记兜住。
 */
function invalidateOutput() {
  outputStale.value = true;
  saveError.value = '';
  saveMessage.value = '';
  savedPath.value = '';
}

async function encodeNow(ticket: number) {
  const src = source.value;
  const bitmap = sourceBitmap.value;
  const box = layout.value;
  if (!src || !bitmap || !box) return;

  // 这一次编码用的格式在 await 前固定下来：结果回来时不能读可能已变化的格式选择器。
  const formatUsed = format.value;
  outputStale.value = true;
  encoding.value = true;
  error.value = '';
  try {
    const data = drawImageData(bitmap, box.width, box.height);
    const result = await ensureEncoder().encode({
      format: formatUsed,
      quality: qualityForFormat(formatUsed, quality.value, pngLevel.value),
      pngLevel: Math.round(pngLevel.value),
      width: box.width,
      height: box.height,
      data,
    });
    if (unmounted || ticket !== generation) return;
    applyOutput(result, formatUsed);
  } catch (rawError) {
    if (unmounted || ticket !== generation) return;
    error.value = rawError instanceof Error ? rawError.message : String(rawError);
  } finally {
    if (!unmounted && ticket === generation) encoding.value = false;
  }
}

function scheduleEncode(delay = 200) {
  invalidateOutput();
  generation += 1;
  const ticket = generation;
  if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    void encodeNow(ticket);
  }, delay);
}

function setFormat(next: ImageFormat) {
  if (format.value === next) return;
  format.value = next;
  saveMessage.value = '';
  scheduleEncode();
}

function onQualityInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  quality.value = value;
  scheduleEncode();
}

function onPngLevelInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  pngLevel.value = value;
  scheduleEncode();
}

function onWidthInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim();
  const src = source.value;
  if (!src) return;
  targetWidth.value = raw === '' ? undefined : clampTargetWidth(Number(raw), src.width);
  scheduleEncode();
}

function onWidthBlur(event: Event) {
  const input = event.target as HTMLInputElement;
  input.value = targetWidth.value === undefined ? '' : String(targetWidth.value);
}

function resetWidth() {
  targetWidth.value = undefined;
  scheduleEncode();
}

function startCompare(event: PointerEvent) {
  comparing.value = true;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  updateCompare(event);
}

function moveCompare(event: PointerEvent) {
  if (!comparing.value) return;
  updateCompare(event);
}

function endCompare() {
  comparing.value = false;
}

function updateCompare(event: PointerEvent) {
  const element = compareRef.value;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) return;
  const percent = ((event.clientX - rect.left) / rect.width) * 100;
  comparePercent.value = Math.min(95, Math.max(5, percent));
}

function nudgeCompare(step: number) {
  comparePercent.value = Math.min(95, Math.max(5, comparePercent.value + step));
}

async function saveImage() {
  const src = source.value;
  const out = output.value;
  if (!src || !out || saving.value || outputStale.value) return;

  // 保存期间素材 / 参数可能变化：先把这一份要保存的数据固定下来。
  const snapshot = {
    generation,
    sourceName: src.name,
    bytes: out.bytes,
    mime: out.mime,
    format: out.format,
  };

  saving.value = true;
  saveError.value = '';
  saveMessage.value = '';
  savedPath.value = '';
  try {
    // 用户取消目录选择时不缓存 cancelled，下次保存必须重新弹出选择器。
    let target = outputTarget;
    if (!target) {
      target = await chooseOutputTarget();
      if (target.kind === 'cancelled') return;
    }
    // 等目录弹窗期间可能换了图片或改了参数：不混用新旧数据，直接取消这次保存。
    if (unmounted || snapshot.generation !== generation) {
      saveError.value = '素材或参数已变化，本次保存已取消，请重新点击保存';
      return;
    }
    outputTarget = target;
    const fileName = formatOutputName(snapshot.sourceName, snapshot.format);
    const blob = new Blob([snapshot.bytes as unknown as BlobPart], { type: snapshot.mime });
    const savedName = await saveBlobToOutputTarget(target, fileName, blob);
    saveMessage.value = `已保存：${savedName}`;
    savedPath.value = target.kind === 'desktop-directory'
      ? joinNativePath(target.path, savedName)
      : '';
  } catch (rawError) {
    saveError.value = rawError instanceof Error ? rawError.message : String(rawError);
  } finally {
    saving.value = false;
  }
}

async function revealSaved() {
  if (!isRevealableOutputPath(savedPath.value)) return;
  try {
    await revealPathInFolder(savedPath.value);
  } catch (rawError) {
    saveError.value = rawError instanceof Error ? rawError.message : String(rawError);
  }
}

onUnmounted(() => {
  unmounted = true;
  generation += 1;
  if (debounceTimer !== undefined) clearTimeout(debounceTimer);
  debounceTimer = undefined;
  releaseOutput();
  releaseSource();
  encoder.value?.dispose();
  encoder.value = undefined;
});
</script>

<template>
  <div class="image-tool">
    <div class="image-tool-body">
      <section class="image-tool-stage" aria-label="图片对比">
        <input
          ref="fileInput"
          type="file"
          class="image-tool-file-input"
          accept="image/jpeg,image/png,image/webp"
          aria-label="选择图片"
          @change="onFileInput"
        />
        <div
          v-if="!source"
          class="image-tool-drop"
          @click="openPicker"
          @dragover="onDragOver"
          @drop.prevent="onDrop"
        >
          <strong>选择一张图片开始压缩</strong>
          <span>支持 JPEG / PNG / WebP；单图本地压缩，不上传、不覆盖原图。</span>
          <button type="button" class="image-tool-primary" @click.stop="openPicker">选择图片</button>
        </div>

        <PreviewViewport v-else :width="source.width" :height="source.height" label="图片对比">
        <div
          ref="compareRef"
          class="image-tool-compare"
        >
          <img :src="sourceUrl" alt="原图" class="image-tool-compare-image" draggable="false" />
          <img
            v-if="output"
            :src="output.url"
            alt="压缩后"
            class="image-tool-compare-image image-tool-compare-overlay"
            :style="{ clipPath: `inset(0 ${100 - comparePercent}% 0 0)` }"
            draggable="false"
          />
          <span class="image-tool-compare-tag image-tool-compare-tag-left">压缩后</span>
          <span class="image-tool-compare-tag image-tool-compare-tag-right">原图</span>
          <div
            class="image-tool-compare-divider"
            role="slider"
            tabindex="0"
            aria-label="对比分割线"
            aria-valuemin="5"
            aria-valuemax="95"
            :aria-valuenow="Math.round(comparePercent)"
            :style="{ left: `${comparePercent}%` }"
            @pointerdown.stop="startCompare"
            @pointermove.stop="moveCompare"
            @pointerup.stop="endCompare"
            @pointercancel.stop="endCompare"
            @keydown.left.prevent="nudgeCompare(-5)"
            @keydown.right.prevent="nudgeCompare(5)"
          >
            <span class="image-tool-compare-handle" aria-hidden="true" />
          </div>
          <span v-if="encoding" class="image-tool-stage-status">正在压缩…</span>
          <div class="image-tool-stage-actions">
            <button type="button" class="image-tool-ghost" @click.stop="openPicker">更换图片</button>
          </div>
        </div>
        </PreviewViewport>
      </section>

      <aside class="image-tool-panel" aria-label="压缩设置">
        <div v-if="source" class="image-tool-file">
          <strong :title="source.name">{{ source.name }}</strong>
          <span>{{ source.width }}×{{ source.height }} · {{ formatImageBytes(source.bytes) }}</span>
        </div>
        <p v-if="wideNote" class="image-tool-note">{{ wideNote }}</p>

        <div class="image-tool-field">
          <span class="image-tool-label">输出格式</span>
          <div class="image-tool-formats" role="radiogroup" aria-label="输出格式">
            <button
              v-for="option in formatOptions"
              :key="option.id"
              type="button"
              class="image-tool-format"
              role="radio"
              :aria-checked="format === option.id"
              :aria-label="option.label"
              :class="{ 'is-active': format === option.id }"
              @click="setFormat(option.id)"
            >
              {{ option.label }}
            </button>
          </div>
          <small class="image-tool-hint">{{ formatNote }}</small>
        </div>

        <label v-if="supportsQuality" class="image-tool-field">
          <span class="image-tool-label">质量 <output>{{ quality }}</output></span>
          <input
            type="range"
            :min="QUALITY_RANGE[0]"
            :max="QUALITY_RANGE[1]"
            step="1"
            :value="quality"
            aria-label="质量"
            @input="onQualityInput"
          />
        </label>

        <label v-else class="image-tool-field">
          <span class="image-tool-label">优化级别 <output>{{ pngLevel }}</output></span>
          <input
            type="range"
            :min="PNG_LEVEL_RANGE[0]"
            :max="PNG_LEVEL_RANGE[1]"
            step="1"
            :value="pngLevel"
            aria-label="PNG 优化级别"
            @input="onPngLevelInput"
          />
          <small class="image-tool-hint">级别越高越慢，均为无损，不改变颜色。</small>
        </label>

        <div v-if="source" class="image-tool-field">
          <span class="image-tool-label">输出宽度</span>
          <div class="image-tool-width">
            <input
              type="number"
              min="1"
              step="1"
              :max="source.width"
              :value="targetWidth ?? ''"
              :placeholder="String(source.width)"
              aria-label="输出宽度"
              @input="onWidthInput"
              @blur="onWidthBlur"
            />
            <span>px</span>
            <button type="button" class="image-tool-ghost" @click="resetWidth">原始</button>
          </div>
          <small class="image-tool-hint">留空保持原宽度；不会放大超过 {{ source.width }}px。</small>
        </div>

        <div v-if="layout" class="image-tool-field">
          <span class="image-tool-label">输出</span>
          <span class="image-tool-output-meta">
            {{ layout.width }}×{{ layout.height }}
            <template v-if="output"> · {{ formatImageBytes(output.bytes.length) }}</template>
          </span>
        </div>

        <p v-if="error" class="image-tool-error" role="alert">{{ error }}</p>
      </aside>
    </div>

    <footer class="image-tool-footer">
      <div class="image-tool-summary">
        <span v-if="encoding" class="image-tool-size">正在压缩…</span>
        <span v-else-if="outputSizeLabel && !outputStale" class="image-tool-size">{{ outputSizeLabel }}</span>
        <span v-else-if="output && outputStale" class="image-tool-size image-tool-size-muted">
          参数已变化，上一份结果不可保存
        </span>
        <span v-else class="image-tool-size image-tool-size-muted">选择图片后可查看压缩前后体积</span>
        <small class="image-tool-hint">同名文件不会覆盖，桌面端会自动追加序号。</small>
      </div>
      <div class="image-tool-save">
        <span v-if="saveMessage" class="image-tool-saved" role="status">
          {{ saveMessage }}
          <button
            v-if="isRevealableOutputPath(savedPath)"
            type="button"
            class="image-tool-link"
            @click="revealSaved"
          >
            显示位置
          </button>
        </span>
        <span v-if="saveError" class="image-tool-error" role="alert">{{ saveError }}</span>
        <button
          type="button"
          class="image-tool-primary"
          :disabled="!output || outputStale || encoding || saving"
          @click="saveImage"
        >
          {{ saving ? '正在保存…' : '保存为…' }}
        </button>
      </div>
    </footer>
  </div>
</template>
