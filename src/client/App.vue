<script setup lang="ts">
import { onMounted } from 'vue'
import AppVideo from './components/AppVideo.vue'
import { useVideoStore } from './stores/video'
import { storeToRefs } from 'pinia'

const { urlBase64 } = storeToRefs(useVideoStore())

onMounted(() => {
  urlBase64.value = new URLSearchParams(window.location.search).get('url') || ''
})
</script>
<template>
  <div class="relative w-full h-screen bg-black overflow-hidden group select-none">
    <div
      v-if="urlBase64.length == 0"
      class="flex flex-col items-center justify-center h-full text-white"
    >
      <h1 class="text-3xl font-bold mb-4">Welcome to Server Player</h1>
      <p class="mb-2">
        Please provide a video URL in the query parameter
        <code class="bg-gray-800 px-2 py-1 rounded">url</code>.
      </p>
      <p class="text-gray-400">
        Example: <code class="bg-gray-800 px-2 py-1 rounded">/?url=BASE64_ENCODED_URL</code>
      </p>
    </div>

    <AppVideo v-else />
  </div>
</template>
