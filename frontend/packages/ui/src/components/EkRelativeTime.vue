<!--
  EkRelativeTime — göreli zaman + mutlak zaman ipucu (operasyon ekranları için tek desen).
  Görünen: "3 dk önce"; ipucu ve ekran okuyucu: "30.09.2026 21:15". `<time datetime>` makine okunur.
  Göreli metin dakikada bir kendiliğinden tazelenir (tek paylaşılan saat; bileşen başına zamanlayıcı yok).

    <EkRelativeTime :value="row.lastSeen" />
-->
<template>
  <v-tooltip v-if="date" :text="absolute" location="top" :open-delay="250" :eager="false" transition="fade-transition">
    <template #activator="{ props: tip }">
      <time v-bind="tip" class="ek-reltime" :datetime="iso">
        <span aria-hidden="true">{{ relative }}</span><span class="ek-sr-only">{{ absolute }}</span>
      </time>
    </template>
  </v-tooltip>
  <span v-else class="ek-reltime">—</span>
</template>

<script lang="ts">
import { ref } from 'vue'

// Tüm örnekler için tek saat (dakikalık); görünür bileşen yoksa da maliyeti tek setInterval.
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
function ensureClock() {
  if (clock || typeof window === 'undefined') return
  clock = setInterval(() => (now.value = Date.now()), 60_000)
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime, formatRelative } from '../format'

const props = defineProps<{ value: string | number | Date | null | undefined }>()
ensureClock()

const date = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') return null
  const d = props.value instanceof Date ? props.value : new Date(props.value)
  return Number.isNaN(d.getTime()) ? null : d
})
const iso = computed(() => date.value?.toISOString())
const absolute = computed(() => formatDateTime(date.value))
const relative = computed(() => formatRelative(date.value, new Date(now.value)))
</script>

<style scoped>
.ek-reltime {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
