<!--
  CopyViewLink — NT-03 "Bu görünümün bağlantısı": geçerli URL'yi (sekme + süzgeçler sorgu dizgisinde) panoya kopyalar.
  Sayfa başlığı eylemlerinde, "Yenile"nin solunda. Sunucu tarafı kayıtlı görünüm → BE-05.
-->
<template>
  <EkButton tone="secondary" :icon="state === 'done' ? 'mdi-check' : 'mdi-link-variant'" data-testid="copy-view-link" :aria-label="ariaLabel" @click="copy">
    <span class="bo-copy-view__text">{{ state === 'done' ? 'Kopyalandı' : state === 'failed' ? 'Kopyalanamadı' : 'Bağlantı' }}</span>
  </EkButton>
  <span class="ek-sr-only" aria-live="polite">{{ state === 'done' ? 'Görünüm bağlantısı kopyalandı' : state === 'failed' ? 'Bağlantı kopyalanamadı' : '' }}</span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import { EkButton } from '@entegrasyonik/ui/components'

const route = useRoute()
const state = ref<'idle' | 'done' | 'failed'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined
const ariaLabel = computed(() => 'Bu görünümün bağlantısını kopyala')

/** Paylaşılan bağlantı: kökten tam URL (yol + sorgu). `route.fullPath` router tabanını içermez → `location` kullanılır. */
function viewUrl(): string {
  return typeof window === 'undefined' ? route.fullPath : window.location.href
}

async function copy() {
  try {
    await navigator.clipboard.writeText(viewUrl())
    state.value = 'done'
  } catch {
    state.value = 'failed'
  }
  clearTimeout(timer)
  timer = setTimeout(() => (state.value = 'idle'), 1500)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
@media (max-width: 599px) {
  .bo-copy-view__text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
