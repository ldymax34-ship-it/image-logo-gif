<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{ width: number; height: number; label: string }>();
const viewport = ref<HTMLElement>();
const available = ref({ width: 0, height: 0 });
const zoom = ref<number>();
const panning = ref(false);
const fit = computed(() => Math.min(1, available.value.width / Math.max(1, props.width), available.value.height / Math.max(1, props.height)) || 1);
const scale = computed(() => zoom.value ?? fit.value);
const contentStyle = computed(() => ({ width: `${Math.max(1, props.width) * scale.value}px`, height: `${Math.max(1, props.height) * scale.value}px` }));
let observer: ResizeObserver | undefined;
let panStart: { id: number; x: number; y: number; left: number; top: number } | undefined;

function startPan(event: PointerEvent) {
  const el = viewport.value;
  if (!el || event.button !== 0 || (event.target as Element).closest('button, input, [role="slider"]')) return;
  if (props.width * scale.value <= available.value.width && props.height * scale.value <= available.value.height) return;
  panStart = { id: event.pointerId, x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
  panning.value = true;
  el.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}
function movePan(event: PointerEvent) {
  const el = viewport.value;
  if (!el || !panStart || panStart.id !== event.pointerId) return;
  el.scrollLeft = panStart.left - (event.clientX - panStart.x);
  el.scrollTop = panStart.top - (event.clientY - panStart.y);
}
function endPan() { panStart = undefined; panning.value = false; }

function reset() {
  endPan();
  zoom.value = undefined;
  if (viewport.value) { viewport.value.scrollLeft = 0; viewport.value.scrollTop = 0; }
}
async function setZoom(value: number) {
  const el = viewport.value;
  if (!el) return;
  const x = (el.scrollLeft + el.clientWidth / 2 - Math.max(0, (el.clientWidth - props.width * scale.value) / 2)) / scale.value;
  const y = (el.scrollTop + el.clientHeight / 2 - Math.max(0, (el.clientHeight - props.height * scale.value) / 2)) / scale.value;
  zoom.value = Math.max(Math.min(fit.value, 0.1), Math.min(4, value));
  await nextTick();
  el.scrollLeft = x * scale.value - el.clientWidth / 2;
  el.scrollTop = y * scale.value - el.clientHeight / 2;
}
watch(() => [props.width, props.height], reset);
onMounted(() => {
  const el = viewport.value!;
  const measure = () => { available.value = { width: el.clientWidth, height: el.clientHeight }; };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(el);
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div class="preview-viewport" :aria-label="label">
    <div class="preview-viewport-toolbar" role="group" :aria-label="`${label}缩放`">
      <button type="button" @click="reset">适应</button>
      <button type="button" @click="setZoom(1)">1:1</button>
      <button type="button" aria-label="缩小预览" @click="setZoom(scale / 1.5)">−</button>
      <output>{{ Math.round(scale * 100) }}%</output>
      <button type="button" aria-label="放大预览" :disabled="scale >= 4" @click="setZoom(scale * 1.5)">+</button>
      <span>放大后拖动查看 · 滚动也可平移</span>
    </div>
    <div ref="viewport" class="preview-viewport-scroll" :class="{ 'is-panning': panning }" tabindex="0" :aria-label="`${label}查看区域`"
      @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan" @dragstart.prevent>
      <div class="preview-viewport-canvas"><div class="preview-viewport-content" :style="contentStyle"><slot /></div></div>
    </div>
  </div>
</template>

<style scoped>
.preview-viewport { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; height: 100%; }
.preview-viewport-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; flex: 0 0 auto; padding: 6px; font-size: 11px; color: var(--color-text-muted); }
.preview-viewport-toolbar button { flex: 0 0 auto; padding: 2px 7px; min-height: 26px; border: 1px solid var(--color-border); border-radius: 5px; background: var(--color-field); color: var(--color-text); cursor: pointer; }
.preview-viewport-toolbar output { min-width: 36px; text-align: center; font-variant-numeric: tabular-nums; }
.preview-viewport-toolbar span { flex-basis: 100%; min-width: 0; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.preview-viewport-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; cursor: grab; user-select: none; touch-action: none; }
.preview-viewport-scroll.is-panning { cursor: grabbing; }
.preview-viewport-canvas { display: grid; place-items: center; min-width: 100%; min-height: 100%; width: max-content; height: max-content; }
.preview-viewport-content { position: relative; flex: none; }
</style>
