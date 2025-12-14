<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'

const videoUrl = ref('')
const quality = ref('720p')
const qualities = ['1080p', '720p', '480p', 'audio']
const videoRef = ref<HTMLVideoElement | null>(null)
const savedTime = ref(0)
const duration = ref(0)
const currentTime = ref(0)
const isSeeking = ref(false)
const isPlaying = ref(false)
const isReloading = ref(false)
const showControls = ref(true)
const showQualityMenu = ref(false)
const totalTraffic = ref(0)
const currentStreamStart = ref(0)
let controlsTimeout: number | null = null
let performanceObserver: PerformanceObserver | null = null

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const urlParam = params.get('url')
  if (urlParam) {
    videoUrl.value = urlParam
    // Restore saved time
    const saved = localStorage.getItem(`progress-${videoUrl.value}`)
    if (saved) {
      savedTime.value = parseFloat(saved)
      currentStreamStart.value = savedTime.value
    }

    // Restore traffic stats
    const savedTraffic = localStorage.getItem('total-traffic')
    if (savedTraffic) {
      totalTraffic.value = parseFloat(savedTraffic)
    }

    // Fetch metadata
    try {
      const res = await fetch(`/api/metadata?url=${encodeURIComponent(videoUrl.value)}`)
      const data = await res.json()
      if (data.duration) {
        duration.value = parseFloat(data.duration)
      }
    } catch (e) {
      console.error('Failed to fetch metadata', e)
    }
  }

  document.addEventListener('mousemove', handleUserActivity)
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleClickOutside)

  // Setup PerformanceObserver to track traffic
  if (window.PerformanceObserver) {
    performanceObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        // Looser check for stream URL to handle relative/absolute paths
        if (entry.entryType === 'resource' && entry.name.includes('api/stream')) {
          const r = entry as PerformanceResourceTiming
          const size = r.transferSize || r.encodedBodySize || 0
          if (size > 0) {
            totalTraffic.value += size
            localStorage.setItem('total-traffic', totalTraffic.value.toString())
          }
        }
      })
    })
    performanceObserver.observe({ type: 'resource', buffered: true })
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleUserActivity)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleClickOutside)
  if (controlsTimeout) clearTimeout(controlsTimeout)
  if (performanceObserver) performanceObserver.disconnect()
})

const handleClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.quality-selector')) {
    showQualityMenu.value = false
  }
}

const handleUserActivity = () => {
  showControls.value = true
  if (controlsTimeout) clearTimeout(controlsTimeout)
  controlsTimeout = setTimeout(() => {
    if (isPlaying.value && !showQualityMenu.value) {
      showControls.value = false
    }
  }, 3000)
}

const handleKeydown = (e: KeyboardEvent) => {
  handleUserActivity()
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlay()
  } else if (e.code === 'ArrowRight') {
    // Forward 5s
    seekRelative(5)
  } else if (e.code === 'ArrowLeft') {
    // Backward 5s
    seekRelative(-5)
  }
}

const streamUrl = computed(() => {
  if (!videoUrl.value) return ''
  return `/api/stream?url=${encodeURIComponent(videoUrl.value)}&quality=${quality.value}&start=${Math.floor(savedTime.value)}`
})

const changeQuality = (newQuality: string) => {
  if (videoRef.value) {
    isReloading.value = true
    const absoluteTime = currentStreamStart.value + videoRef.value.currentTime
    savedTime.value = absoluteTime
    currentStreamStart.value = absoluteTime
  }
  quality.value = newQuality
  showQualityMenu.value = false
}

const onTimeUpdate = () => {
  if (isReloading.value) return

  if (videoRef.value && videoUrl.value) {
    const absoluteTime = currentStreamStart.value + videoRef.value.currentTime

    if (!isSeeking.value) {
      currentTime.value = absoluteTime
    }

    if (!videoRef.value.paused) {
      localStorage.setItem(`progress-${videoUrl.value}`, absoluteTime.toString())
      isPlaying.value = true
    } else {
      isPlaying.value = false
    }
  }
}

const onSeek = () => {
  const newTime = currentTime.value

  isReloading.value = true
  savedTime.value = newTime
  currentStreamStart.value = newTime
  isSeeking.value = false
}

const onSeeking = () => {
  isSeeking.value = true
}

const seekRelative = (seconds: number) => {
  let newTime = currentTime.value + seconds
  if (newTime < 0) newTime = 0
  if (duration.value > 0 && newTime > duration.value) newTime = duration.value

  isReloading.value = true
  savedTime.value = newTime
  currentStreamStart.value = newTime
  currentTime.value = newTime
}

const togglePlay = () => {
  if (videoRef.value) {
    if (videoRef.value.paused) {
      videoRef.value.play()
      isPlaying.value = true
    } else {
      videoRef.value.pause()
      isPlaying.value = false
    }
  }
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const onLoadedMetadata = () => {
  isReloading.value = false
  if (videoRef.value) {
    videoRef.value.play().catch((e) => console.error('Auto-play failed', e))
    isPlaying.value = true
  }
}
</script>
<template>
  <div class="relative w-full h-screen bg-black overflow-hidden group select-none">
    <div v-if="!videoUrl" class="flex flex-col items-center justify-center h-full text-white">
      <h1 class="text-3xl font-bold mb-4">Welcome to Server Player</h1>
      <p class="mb-2">
        Please provide a video URL in the query parameter
        <code class="bg-gray-800 px-2 py-1 rounded">url</code>.
      </p>
      <p class="text-gray-400">
        Example: <code class="bg-gray-800 px-2 py-1 rounded">/?url=BASE64_ENCODED_URL</code>
      </p>
    </div>

    <div v-else class="w-full h-full relative flex items-center justify-center">
      <!-- Video Element -->
      <video
        ref="videoRef"
        :src="streamUrl"
        class="w-full h-full object-contain"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
        @click="togglePlay"
        @play="isPlaying = true"
        @pause="isPlaying = false"
      ></video>

      <!-- Loading/Buffering Indicator could go here -->

      <!-- Controls Overlay -->
      <div
        class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/60 to-transparent px-6 pb-6 pt-12 transition-opacity duration-300"
        :class="{ 'opacity-0': !showControls, 'opacity-100': showControls }"
      >
        <!-- Seek Bar -->
        <div class="flex items-center gap-4 mb-4" v-if="duration > 0">
          <span class="text-white text-sm font-mono min-w-15 text-right">{{
            formatTime(currentTime)
          }}</span>
          <div class="relative flex-1 h-2 group/slider cursor-pointer">
            <input
              type="range"
              min="0"
              :max="duration"
              v-model.number="currentTime"
              @change="onSeek"
              @input="onSeeking"
              class="absolute w-full h-full opacity-0 z-10 cursor-pointer"
            />
            <!-- Custom Track -->
            <div
              class="absolute top-0 left-0 w-full h-1 bg-white/30 rounded-full mt-0.5 group-hover/slider:h-1.5 transition-all"
            >
              <!-- Progress -->
              <div
                class="h-full bg-blue-500 rounded-full relative"
                :style="{ width: `${(currentTime / duration) * 100}%` }"
              >
                <!-- Thumb -->
                <div
                  class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full scale-0 group-hover/slider:scale-100 transition-transform shadow"
                ></div>
              </div>
            </div>
          </div>
          <span class="text-white text-sm font-mono min-w-15">{{ formatTime(duration) }}</span>
        </div>

        <!-- Bottom Controls Row -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <!-- Play/Pause Button -->
            <button
              @click="togglePlay"
              class="text-white hover:text-blue-400 transition-colors focus:outline-none"
            >
              <svg
                v-if="!isPlaying"
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <svg
                v-else
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            </button>
          </div>

          <div class="flex items-center gap-4">
            <!-- Quality Selector -->
            <div class="relative group/quality quality-selector">
              <button
                @click.stop="showQualityMenu = !showQualityMenu"
                class="text-white font-medium hover:text-blue-400 transition-colors px-2 py-1 rounded border border-white/20 bg-black/50 backdrop-blur-sm"
              >
                {{ quality }}
              </button>
              <!-- Dropdown (upwards) -->
              <div
                v-if="showQualityMenu"
                class="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded overflow-hidden min-w-20"
              >
                <button
                  v-for="q in qualities"
                  :key="q"
                  @click="changeQuality(q)"
                  class="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
                  :class="{ 'text-blue-400': quality === q }"
                >
                  {{ q }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Info Overlay -->
      <div
        class="absolute top-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded text-xs text-white/70 pointer-events-none"
      >
        <p>Traffic: {{ formatSize(totalTraffic) }}</p>
      </div>
    </div>
  </div>
</template>

<style>
/* Reset default range input styles */
input[type='range'] {
  -webkit-appearance: none;
  background: transparent;
}
input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
}
input[type='range']:focus {
  outline: none;
}
</style>
