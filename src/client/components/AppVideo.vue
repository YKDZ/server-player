<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { qualities, useVideoStore } from '../stores/video'
import { useTemplateRef, watch, ref, onMounted, onUnmounted } from 'vue'
import { formatBytes, formatTime } from '@/utils/string'

const {
  isPlaying,
  videoEl: storeVideoEl,
  streamUrl,
  volume,
  progress,
  currentTime,
  startTime,
  quality,
  totalTime,
  isHandlingProgressChange,
} = storeToRefs(useVideoStore())

const videoEl = useTemplateRef<HTMLVideoElement>('videoEl')
const showOverlay = ref(true)
const isHoveringControls = ref(false)
let hideTimer: number | null = null
const isTouchDevice = ref(false)
const totalBytes = ref(0)
let abortController: AbortController | null = null
let mediaSource: MediaSource | null = null

const { play, pause, seek, setVolume, restoreVolume } = useVideoStore()

const onTimeUpdate = () => {
  if (isHandlingProgressChange.value) return
  currentTime.value = startTime.value + (videoEl.value?.currentTime ?? 0)
}

const onProgressInput = (event: Event) => {
  isHandlingProgressChange.value = true
  const value = Number((event.target as HTMLInputElement).value)
  if (totalTime.value) {
    currentTime.value = (value / 100) * totalTime.value
  }
}

const onProgressChange = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)

  if (event.isTrusted) seek(value)
}

const loadVideo = () => {
  if (abortController) abortController.abort()

  if (videoEl.value && videoEl.value.src) {
    URL.revokeObjectURL(videoEl.value.src)
    videoEl.value.removeAttribute('src')
  }

  totalBytes.value = 0
  if (!streamUrl.value || !videoEl.value) return

  abortController = new AbortController()
  const signal = abortController.signal

  mediaSource = new MediaSource()
  videoEl.value.src = URL.createObjectURL(mediaSource)

  mediaSource.addEventListener('sourceopen', () => {
    if (!mediaSource || mediaSource.readyState !== 'open') return

    // Use appropriate codec based on quality
    // 'avc1.42E01E' is Constrained Baseline Profile, Level 3.0 (Very compatible)
    // 'avc1.4D401F' is Main Profile, Level 3.1
    // 'avc1.64001F' is High Profile, Level 3.1
    // We use a safer baseline/main profile guess here.
    const mime =
      quality.value === 'audio' ? 'audio/mpeg' : 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'

    if (!MediaSource.isTypeSupported(mime)) {
      console.error('MIME type not supported:', mime)
      return
    }

    const sourceBuffer = mediaSource.addSourceBuffer(mime)
    const queue: Uint8Array[] = []
    let isReading = false
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

    // Buffer control parameters
    const MAX_BUFFER_AHEAD = 30 // seconds
    const MAX_QUEUE_SIZE = 10 // chunks

    const checkBuffer = () => {
      if (abortController?.signal.aborted) return
      if (isReading) return
      if (queue.length >= MAX_QUEUE_SIZE) return

      const el = videoEl.value
      if (!el) return

      let bufferedEnd = 0
      const time = el.currentTime

      // Find the buffered range that contains the current time
      for (let i = 0; i < el.buffered.length; i++) {
        if (el.buffered.start(i) <= time + 0.5 && el.buffered.end(i) >= time) {
          bufferedEnd = el.buffered.end(i)
          break
        }
      }

      const bufferHealth = bufferedEnd - time

      // If buffer is healthy enough, stop reading
      if (bufferHealth >= MAX_BUFFER_AHEAD) return

      readNext()
    }

    const readNext = () => {
      if (!reader || isReading) return
      isReading = true

      reader
        .read()
        .then(({ done, value }) => {
          isReading = false
          if (done) {
            if (mediaSource?.readyState === 'open') {
              mediaSource.endOfStream()
            }
            return
          }

          if (value) {
            totalBytes.value += value.byteLength
            queue.push(value)
            processQueue()
            // Check if we need more data immediately
            checkBuffer()
          }
        })
        .catch((err) => {
          isReading = false
          if (err.name !== 'AbortError') console.error('Stream read error', err)
        })
    }

    const processQueue = () => {
      if (videoEl.value?.error) {
        console.error('Video element error:', videoEl.value.error)
        return
      }
      if (queue.length > 0 && !sourceBuffer.updating) {
        try {
          sourceBuffer.appendBuffer(queue.shift()! as unknown as BufferSource)
        } catch (e) {
          console.error('SourceBuffer append error', e)
        }
      } else {
        // Queue is empty or updating, check if we need to read more
        checkBuffer()
      }
    }

    sourceBuffer.addEventListener('updateend', processQueue)
    sourceBuffer.addEventListener('error', (e) => console.error('SourceBuffer error:', e))

    // Monitor playback time to trigger buffer refills
    const onTimeUpdateInternal = () => {
      checkBuffer()
    }
    videoEl.value?.addEventListener('timeupdate', onTimeUpdateInternal)

    // Cleanup listener on abort
    abortController?.signal.addEventListener('abort', () => {
      videoEl.value?.removeEventListener('timeupdate', onTimeUpdateInternal)
    })

    // Ensure video plays if it was playing before
    if (isPlaying.value) {
      videoEl.value?.play().catch(() => {})
    }

    fetch(streamUrl.value, { signal })
      .then((response) => {
        if (!response.body) return
        reader = response.body.getReader()
        readNext()
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error('Fetch error', err)
      })
  })
}

watch(
  [streamUrl, videoEl],
  () => {
    loadVideo()
  },
  { immediate: true },
)

const startHideTimer = () => {
  if (hideTimer) clearTimeout(hideTimer)
  if (!isHoveringControls.value) {
    hideTimer = setTimeout(() => {
      showOverlay.value = false
    }, 2000)
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
  if (!isTouchDevice.value) {
    showOverlay.value = false
    clearHideTimer()
  } else {
    startHideTimer()
  }
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
  if (abortController) abortController.abort()
  if (videoEl.value && videoEl.value.src) {
    URL.revokeObjectURL(videoEl.value.src)
  }
})

watch(videoEl, (el) => {
  storeVideoEl.value = el || undefined
})
</script>

<template>
  <div
    class="w-full h-full relative flex justify-center items-center bg-black overflow-hidden select-none"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
    @click="onContainerClick"
    @dblclick="onContainerDblClick"
  >
    <video
      ref="videoEl"
      class="w-full h-full block object-contain"
      :volume
      playsinline
      @timeupdate="onTimeUpdate"
      @error="(e) => console.error('Video Error:', (e.target as HTMLVideoElement).error)"
    ></video>

    <!-- UI Overlay Wrapper -->
    <div
      class="absolute inset-0 transition-opacity duration-200 pointer-events-none"
      :class="{ 'opacity-0': !showOverlay, 'opacity-100': showOverlay }"
    >
      <!-- Center Play/Pause Button -->
      <div id="overlay" class="absolute inset-0 flex items-center justify-center bg-black/25">
        <button
          v-if="!isPlaying"
          @click.stop="play"
          class="pointer-events-auto text-white text-4xl transition-transform hover:scale-105 hover:cursor-pointer"
          aria-label="Play"
        >
          <div class="icon-[mdi--play]" />
        </button>
        <button
          v-else
          @click.stop="pause"
          class="pointer-events-auto text-white text-4xl transition-transform hover:scale-105 hover:cursor-pointer"
          aria-label="Pause"
        >
          <div class="icon-[mdi--pause]" />
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
        <div>
          <span class="text-sm text-white drop-shadow-md font-mono">
            {{ formatBytes(totalBytes) }}
          </span>
        </div>
        <div class="flex items-center justify-between w-36 gap-1 hover:cursor-pointer">
          <div
            class="text-gray-100 text-2xl"
            @click="volume !== 0 ? setVolume(0) : restoreVolume()"
            :class="{
              'icon-[mdi--volume-mute]': volume === 0,
              'icon-[mdi--volume-low]': volume < 0.33,
              'icon-[mdi--volume-medium]': volume >= 0.33 && volume < 0.66,
              'icon-[mdi--volume-high]': volume >= 0.66,
            }"
          />
          <input
            type="range"
            id="volume"
            min="0"
            max="1"
            step="0.01"
            class="accent-white cursor-pointer w-full"
            v-model.number="volume"
          />
        </div>
      </div>

      <!-- Bottom Controls -->
      <div
        class="absolute bottom-0 left-0 right-0 flex items-center p-8 space-x-8 bg-linear-to-t from-black/70 to-transparent pointer-events-auto"
        @mouseenter="onControlsMouseEnter"
        @mouseleave="onControlsMouseLeave"
        @click.stop
        @dblclick.stop
      >
        <div class="flex gap-2 w-full justify-center items-center">
          <span class="text-gray-300 text-center text-sm font-mono">
            {{ formatTime(currentTime) }}
          </span>
          <input
            type="range"
            id="progress"
            min="0"
            max="100"
            :value="progress"
            step="0.01"
            class="flex-1 h-1 rounded accent-white cursor-pointer"
            @input="onProgressInput"
            @change="onProgressChange"
          />
          <span class="text-gray-300 text-center text-sm font-mono">
            {{ formatTime(totalTime || 0) }}
          </span>
        </div>

        <select v-model="quality" class="bg-gray-100">
          <option v-for="q in qualities" :key="q" :value="q">
            {{ q }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
