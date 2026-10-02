<!--
  BoTableFrame — ÖZEL SATIRLI tablo kabı (BO2-40). `.bo-table` işaretlemesinin TEK yeri: odaklanabilir kaydırma bölgesi
  (axe scrollable-region-focusable), ekran okuyucu başlığı, yoğunluk, yapışkan başlık. Sütun tanımıyla çizilebilen
  listeler `BoDataTable` kullanır; satır içi zengin hücre (birden çok bağlantı, iz) gerekiyorsa bu kap.

    <BoTableFrame label="Podlar" density="compact">
      <template #head><tr><th scope="col">Pod</th><th scope="col" class="is-num">Kira</th></tr></template>
      <tr v-for="p in pods" :key="p.pod">…</tr>
    </BoTableFrame>
-->
<template>
  <div class="bo-table-wrap" :class="{ 'bo-table-wrap--flat': flat }" tabindex="0" role="region" :aria-label="`${label} tablosu`" :style="maxHeight ? { '--bo-table-max-h': maxHeight } : undefined">
    <table class="bo-table" :data-density="density">
      <caption class="ek-sr-only">{{ label }}</caption>
      <thead><slot name="head" /></thead>
      <tbody><slot /></tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label: string; density?: 'comfortable' | 'compact'; flat?: boolean; maxHeight?: string }>(), { density: 'compact' })
</script>
