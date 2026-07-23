<script setup lang="ts">
import { closeGifMediaPreview } from '../app/gifMediaLauncher';

// Source note: layout semantics are adapted from FFUI 4122222415bc209c711c7c166fc78d2d6d1dc139
// (QueuePanel.vue, QueueItem.vue, useDragAndDrop.ts). No FFUI source code is copied here.
const PRESETS = ['高清', '8MB 倾向', '快速预览', '原尺寸'];
const STATUS_LEGEND = ['等待', '运行', '成功', '失败', '取消'];

async function closePreview() {
  await closeGifMediaPreview();
}
</script>

<template>
  <main class="gif-media-preview" aria-label="GIF / 媒体工具实验预览">
    <header class="gif-media-header">
      <div>
        <div class="gif-media-title-line">
          <h1>GIF / 媒体工具</h1>
          <span class="gif-media-badge">实验预览</span>
        </div>
        <p>队列与参数界面仅供确认，转换引擎尚未接入。</p>
      </div>
      <button type="button" class="gif-media-close" @click="closePreview">返回工具箱</button>
    </header>

    <div class="gif-media-layout">
      <section class="gif-media-queue" aria-labelledby="gif-media-queue-title">
        <div class="gif-media-section-header">
          <div>
            <span class="gif-media-kicker">任务队列</span>
            <h2 id="gif-media-queue-title">等待添加媒体文件</h2>
          </div>
          <span class="gif-media-count">0 个任务</span>
        </div>

        <button type="button" class="gif-media-dropzone" disabled aria-label="媒体文件选择区，转换引擎尚未接入">
          <strong>拖入 MP4、MOV 或 GIF</strong>
          <span>文件选择与队列执行将在转换引擎接入后开放。</span>
        </button>

        <div class="gif-media-empty-state">
          <strong>队列为空</strong>
          <p>当前不会读取、写入或转换任何文件。</p>
        </div>

        <div class="gif-media-status-legend" aria-label="任务状态图例">
          <span v-for="status in STATUS_LEGEND" :key="status">{{ status }}</span>
        </div>
      </section>

      <aside class="gif-media-settings" aria-labelledby="gif-media-settings-title">
        <div class="gif-media-section-header">
          <div>
            <span class="gif-media-kicker">输出设置</span>
            <h2 id="gif-media-settings-title">GIF 参数</h2>
          </div>
          <span class="gif-media-preview-only">仅预览</span>
        </div>

        <div class="gif-media-presets" aria-label="转换预设">
          <button v-for="preset in PRESETS" :key="preset" type="button" disabled>{{ preset }}</button>
        </div>

        <div class="gif-media-form">
          <label><span>起止时间</span><input disabled value="00:00 - 00:00" aria-label="起止时间，转换引擎尚未接入" /></label>
          <label><span>输出尺寸</span><select disabled aria-label="输出尺寸，转换引擎尚未接入"><option>保持原尺寸</option></select></label>
          <label><span>FPS</span><select disabled aria-label="FPS，转换引擎尚未接入"><option>自动</option></select></label>
          <label><span>循环</span><select disabled aria-label="循环，转换引擎尚未接入"><option>循环播放</option></select></label>
          <label><span>质量 / 体积</span><select disabled aria-label="质量和体积倾向，转换引擎尚未接入"><option>平衡</option></select></label>
          <label><span>输出目录</span><input disabled value="选择后显示" aria-label="输出目录，转换引擎尚未接入" /></label>
        </div>

        <div class="gif-media-engine-note" role="status">
          <strong>转换引擎尚未接入</strong>
          <span>开始处理将在 FFmpeg / FFprobe sidecar 验证通过后开放。</span>
        </div>
        <button type="button" class="gif-media-start" disabled aria-describedby="gif-media-engine-message">开始处理</button>
        <p id="gif-media-engine-message" class="gif-media-engine-message">此实验预览不会创建队列、显示假进度或生成结果。</p>
      </aside>
    </div>
  </main>
</template>
