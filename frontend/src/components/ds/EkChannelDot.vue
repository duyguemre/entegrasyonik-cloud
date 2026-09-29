<!--
  frontend/src/components/ds/EkChannelDot.vue

  DS-v2 — liste hücresinde satış kanalı / entegrasyon göstergesi: 8px marka
  rengi nokta + kanal adı. Nokta rengi YALNIZCA `integrationAccent`
  (palette.ts) — 6 canlı entegrasyon; tanımsız kod nötr noktaya düşer.
  Renk tek başına anlam taşımaz: ad her zaman yazılır (`showName=false`
  ise nokta `title` + ekran okuyucu adıyla gelir).

  Kullanım:
    <EkChannelDot code="trendyol" />               → ● Trendyol
    <EkChannelDot code="xyz" name="Özel kanal" />   → ● Özel kanal (nötr)
-->
<template>
  <span class="ek-channel" :title="showName ? undefined : label">
    <span class="ek-channel__dot" :class="{ 'is-neutral': !accent }" aria-hidden="true"></span>
    <span :class="showName ? 'ek-channel__name' : 'ek-sr-only'">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { integrationAccent } from '@/design/tokens/palette'

const props = withDefaults(defineProps<{ code?: string | null; name?: string | null; showName?: boolean }>(), {
  code: '',
  name: '',
  showName: true,
})

const KNOWN_NAMES: Record<string, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'N11',
  pazarama: 'Pazarama',
  ideasoft: 'Ideasoft',
  bizimhesap: 'Bizimhesap',
}

const key = computed(() => String(props.code ?? '').toLowerCase())
const accent = computed(() => (integrationAccent as Record<string, string>)[key.value])
const label = computed(() => {
  if (props.name) return props.name
  if (KNOWN_NAMES[key.value]) return KNOWN_NAMES[key.value]
  const c = String(props.code ?? '')
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Bilinmeyen'
})
// `v-bind()` ile CSS değişkenine bağlanır — şablonda dinamik stil YAZILMAZ (literal-stil mandalı).
const dotColor = computed(() => accent.value ?? 'var(--ek-color-neutral)')
</script>

<style scoped>
.ek-channel {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-channel__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: v-bind(dotColor);
}

.ek-channel__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
