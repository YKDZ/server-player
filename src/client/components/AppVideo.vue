<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { qualities, useVideoStore } from '../stores/video'
import { useTemplateRef, watch, ref, onMounted, onUnmounted } from 'vue'

const {
  isPlaying,
  videoEl: storeVideoEl,
  streamUrl,
  volume,
  progress,
  currentTime,
  startTime,
  quality,
} = storeToRefs(useVideoStore())

const videoEl = useTemplateRef<HTMLVideoElement>('videoEl')

const { play, pause, seek } = useVideoStore()

const onTimeUpdate = () => {
  currentTime.value = startTime.value + (videoEl.value?.currentTime ?? 0)
}

const onProgressChange = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)

  if (event.isTrusted) seek(value)
}

watch(videoEl, (el) => {
  storeVideoEl.value = el || undefined
})

// --- Overlay & Interaction Logic ---

const showOverlay = ref(true)
const isHoveringControls = ref(false)
let hideTimer: number | null = null
const isTouchDevice = ref(false)

const startHideTimer = () => {
  if (hideTimer) clearTimeout(hideTimer)
  // 鼠标不在 controls 或 headers 中且一段时间不移动则自动关闭
  if (!isHoveringControls.value) {
    hideTimer = setTimeout(() => {
      showOverlay.value = false
    }, 1000)
  }
}

const clearHideTimer = () => {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
}

const onMouseMove = () => {
  showOverlay.value = true
  startHideTimer()
}

const onMouseLeave = () => {
  startHideTimer()
}

const togglePlay = () => {
  if (isPlaying.value) pause()
  else play()
}

const onContainerClick = () => {
  showOverlay.value = true
  startHideTimer()

  if (!isTouchDevice.value) {
    togglePlay()
  }
}

const onContainerDblClick = () => {
  if (isTouchDevice.value) {
    togglePlay()
  }
}

const onControlsMouseEnter = () => {
  isHoveringControls.value = true
  clearHideTimer()
  showOverlay.value = true
}

const onControlsMouseLeave = () => {
  isHoveringControls.value = false
  startHideTimer()
}

onMounted(() => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  startHideTimer()
})

onUnmounted(() => {
  if (hideTimer) clearTimeout(hideTimer)
})
</script>

<template>
  <div
    class="w-full h-full relative justify-center items-center flex bg-black overflow-hidden select-none"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
    @click="onContainerClick"
    @dblclick="onContainerDblClick"
  >
    <video
      ref="videoEl"
      :src="streamUrl"
      class="w-full h-full block object-contain"
      :volume
      playsinline
      @timeupdate="onTimeUpdate"
    ></video>

    <!-- UI Overlay Wrapper -->
    <div
      class="absolute inset-0 transition-opacity duration-300 pointer-events-none"
      :class="{ 'opacity-0': !showOverlay, 'opacity-100': showOverlay }"
    >
      <!-- Center Play/Pause Button -->
      <div id="overlay" class="absolute inset-0 flex items-center justify-center bg-black/25">
        <button
          v-if="!isPlaying"
          id="play"
          class="pointer-events-auto text-white text-4xl rounded-full bg-black/50 p-4 hover:bg-black/70 transition-transform active:scale-95"
          @click.stop="play"
        >
          PLAY
        </button>
        <button
          v-else
          id="pause"
          class="pointer-events-auto text-white text-4xl rounded-full bg-black/50 p-4 hover:bg-black/70 transition-transform active:scale-95"
          @click.stop="pause"
        >
          PAUSE
        </button>
      </div>

      <!-- Headers -->
      <div
        id="headers"
        class="absolute top-0 left-0 right-0 flex items-center justify-between p-6 bg-linear-to-b from-black/70 to-transparent pointer-events-auto"
        @mouseenter="onControlsMouseEnter"
        @mouseleave="onControlsMouseLeave"
        @click.stop
        @dblclick.stop
      >
        <div></div>
        <div>
          <input
            type="range"
            id="volume"
            min="0"
            max="1"
            step="0.01"
            value="0.5"
            class="justify-self-end accent-white cursor-pointer"
            v-model="volume"
          />
        </div>
      </div>

      <!-- Bottom Controls -->
      <div
        class="absolute bottom-0 left-0 right-0 flex items-center p-8 gap-x-2 bg-linear-to-t from-black/70 to-transparent pointer-events-auto"
        @mouseenter="onControlsMouseEnter"
        @mouseleave="onControlsMouseLeave"
        @click.stop
        @dblclick.stop
      >
        <input
          type="range"
          id="progress"
          min="0"
          max="100"
          value="0"
          step="0.01"
          v-model="progress"
          class="flex-1 h-1 rounded accent-white cursor-pointer"
          @change="onProgressChange"
        />
        <select v-model="quality" class="bg-white">
          <option v-for="quality in qualities" :key="quality" :value="quality">
            {{ quality }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
