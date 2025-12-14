<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'

const videoUrl = ref('')
const quality = ref('720p')
const qualities = ['1080p', '720p', '480p', 'audio']
const videoRef = ref<HTMLVideoElement | null>(null)
const savedTime = ref(0)

// Get URL from query params
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const urlParam = params.get('url')
  if (urlParam) {
    videoUrl.value = urlParam
    // Restore saved time
    const saved = localStorage.getItem(`progress-${videoUrl.value}`)
    if (saved) {
      savedTime.value = parseFloat(saved)
      console.log('Restored time:', savedTime.value)
    }
  }
})

const streamUrl = computed(() => {
  if (!videoUrl.value) return ''
  // We use the savedTime as the start time for the stream
  return `/api/stream?url=${encodeURIComponent(videoUrl.value)}&quality=${quality.value}&start=${Math.floor(savedTime.value)}`
})

const changeQuality = (newQuality: string) => {
  if (videoRef.value) {
    // Calculate current absolute time before switching
    const currentOffset = parseFloat(
      new URLSearchParams(streamUrl.value.split('?')[1]).get('start') || '0',
    )
    const absoluteTime = currentOffset + videoRef.value.currentTime
    savedTime.value = absoluteTime
  }
  quality.value = newQuality
}

const onTimeUpdate = () => {
  if (videoRef.value && videoUrl.value) {
    const currentOffset = parseFloat(
      new URLSearchParams(streamUrl.value.split('?')[1]).get('start') || '0',
    )
    const absoluteTime = currentOffset + videoRef.value.currentTime

    // Only update if we are playing (to avoid overwriting with 0 on load)
    if (!videoRef.value.paused) {
      localStorage.setItem(`progress-${videoUrl.value}`, absoluteTime.toString())
    }
  }
}

const onLoadedMetadata = () => {
  if (videoRef.value) {
    videoRef.value.play().catch((e) => console.error('Auto-play failed', e))
  }
}
</script>

<template>
  <div class="container">
    <div v-if="!videoUrl" class="no-url">
      <h1>Welcome to Server Player</h1>
      <p>Please provide a video URL in the query parameter <code>url</code>.</p>
      <p>Example: <code>/?url=BASE64_ENCODED_URL</code></p>
    </div>

    <div v-else class="player-wrapper">
      <div class="controls">
        <label>Quality: </label>
        <select
          :value="quality"
          @change="(e) => changeQuality((e.target as HTMLSelectElement).value)"
        >
          <option v-for="q in qualities" :key="q" :value="q">{{ q }}</option>
        </select>
      </div>

      <video
        ref="videoRef"
        :src="streamUrl"
        controls
        autoplay
        class="video-player"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
      ></video>

      <div class="info">
        <p>Source (Base64): {{ videoUrl.substring(0, 20) }}...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
  color: #fff;
}

.video-player {
  width: 100%;
  max-width: 1000px;
  margin-top: 20px;
  background: #000;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.controls {
  margin-bottom: 1rem;
  background: #333;
  padding: 10px;
  border-radius: 4px;
  display: inline-block;
}

select {
  padding: 5px;
  font-size: 16px;
  background: #444;
  color: white;
  border: 1px solid #666;
  border-radius: 4px;
}

.no-url {
  margin-top: 50px;
}

code {
  background: #333;
  padding: 2px 5px;
  border-radius: 3px;
}
</style>
