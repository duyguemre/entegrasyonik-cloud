<!--
  frontend/src/components/ds/EkCollapse.vue

  DS-v2 Aşama 5 — TEK aç/kapa geçişi (filtre paneli, "sayfa hakkında" paneli …). Yükseklik + opaklık birlikte,
  `--ek-duration-base` (200ms) + standart eğri; ölçüm/JS yok: `grid-template-rows 0fr ↔ 1fr` yüksekliği içerikten
  alır → içerik zıplaması olmaz, altındaki öğeler aynı eğriyle kayar. Reduced-motion'da süre token'ı 0 → anında.
  Kapalıyken `visibility: hidden` (geçiş BİTİNCE) + `inert`: odak/ekran okuyucu içeriğe girmez, Playwright
  "gizli" sayar (eski `v-show` sözleşmesi korunur).
-->
<template>
  <div class="ek-collapse" :class="{ 'is-open': open }" :inert="!open || undefined">
    <div class="ek-collapse__inner"><slot /></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ open: boolean }>()
</script>

<style scoped>
.ek-collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  visibility: hidden;
  transition:
    grid-template-rows var(--ek-motion-reveal),
    opacity var(--ek-motion-reveal),
    visibility 0s var(--ek-motion-reveal-duration);
}

.ek-collapse.is-open {
  grid-template-rows: 1fr;
  opacity: 1;
  visibility: visible;
  transition:
    grid-template-rows var(--ek-motion-reveal),
    opacity var(--ek-motion-reveal),
    visibility 0s 0s;
}

.ek-collapse__inner {
  min-height: 0;
  overflow: hidden;
}
</style>
