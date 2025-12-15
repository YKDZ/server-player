import { computedAsync, useDebounceFn, useToggle } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

export const qualities = ['1080p', '720p', '480p', '360p', 'audio']

type Quality = (typeof qualities)[number]

export const useVideoStore = defineStore('video', () => {
  const urlBase64 = ref('')
  const quality = ref<Quality>('720p')
  const volume = ref(0.8)
  const previousVolume = ref(0.8)

  const [isPlaying, togglePlay] = useToggle()
  const [isReloading, toggleReloading] = useToggle()
  const [isSeeking, toggleSeeking] = useToggle()

  const startTime = ref(0)
  const currentTime = ref(0)

  const videoEl = shallowRef<HTMLVideoElement>()

  const streamUrl = computed(() => {
    if (!urlBase64.value) return ''
    return `/api/stream?url=${encodeURIComponent(urlBase64.value)}&quality=${quality.value}&start=${Math.floor(startTime.value)}`
  })

  const totalTime = computedAsync(async () => {
    if (!streamUrl.value) return

    try {
      const res = await fetch(`/api/metadata?url=${encodeURIComponent(urlBase64.value)}`)
      const data = await res.json()
      if (data.duration) {
        return parseFloat(data.duration)
      }
    } catch (e) {
      console.error('Failed to fetch metadata', e)
    }
  })

  const progress = computed(() => {
    if (!totalTime.value) return 0
    return (currentTime.value / totalTime.value) * 100
  })

  const setVolume = (value: number) => {
    previousVolume.value = volume.value
    volume.value = value
  }

  const restoreVolume = () => {
    const temp = volume.value
    volume.value = previousVolume.value
    previousVolume.value = temp
  }

  const play = () => {
    if (!videoEl.value || isPlaying.value) return

    isPlaying.value = true
    videoEl.value.play()
  }

  const pause = () => {
    if (!videoEl.value || !isPlaying.value) return

    isPlaying.value = false
    videoEl.value.pause()
  }

  const seek = useDebounceFn((to: number) => {
    if (!totalTime.value) return

    startTime.value = (to / 100) * totalTime.value
    currentTime.value = 0
    play()
  }, 500)

  return {
    urlBase64,
    isPlaying,
    togglePlay,
    isReloading,
    toggleReloading,
    isSeeking,
    toggleSeeking,
    startTime,
    totalTime,
    currentTime,
    videoEl,
    streamUrl,
    play,
    pause,
    seek,
    setVolume,
    restoreVolume,
    volume,
    progress,
    quality,
  }
})
