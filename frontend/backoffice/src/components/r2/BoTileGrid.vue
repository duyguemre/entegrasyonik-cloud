<!--
  BoTileGrid — EŞ YÜKSEKLİKLİ, HİZALI KUTU IZGARASI (BO2-12). Aynı satırdaki kutular aynı yükseklikte ve kenarlardan
  hizalıdır: ızgara hücreleri `stretch`, doğrudan çocuklar hücreyi doldurur (BoSection `fill` gerekmez — burada zorlanır).

    <BoTileGrid :cols="2">                 → 1440'ta 2 sütun, < 1024 px tek sütun
      <BoSection title="Bağımlılıklar">…</BoSection>
      <BoSection title="Kuyruklar">…</BoSection>
    </BoTileGrid>
    <BoTileGrid :min="200" dense>…BoStat × n…</BoTileGrid>   → kendiliğinden sığan sütunlar (KPI şeridi)

  `cols` verildiğinde sütun sayısı sabittir (kırılım: < 1024 px → en çok 2, < 600 px → 1; `mobile-cols` ile değişir).
  `min` verildiğinde sütun sayısı genişlikten türer (`auto-fit`). `span` için çocukta `data-span="2"`.
-->
<template>
  <div class="bo-tiles" :class="{ 'is-dense': dense, 'is-auto': !cols }" :style="style" data-bo-tiles>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ cols?: 1 | 2 | 3 | 4 | 5 | 6; min?: number; dense?: boolean; mobileCols?: 1 | 2 }>(), {
  min: 260,
  mobileCols: 1,
})

const style = computed(() => ({
  '--bo-tiles-cols': String(props.cols ?? 0),
  '--bo-tiles-min': `${props.min}px`,
  '--bo-tiles-mobile': String(props.mobileCols),
}))
</script>

<style scoped>
.bo-tiles {
  display: grid;
  grid-template-columns: repeat(var(--bo-tiles-cols), minmax(0, 1fr));
  align-items: stretch;
  gap: var(--ek-space-4);
  min-width: 0;
}

.bo-tiles.is-auto {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--bo-tiles-min)), 1fr));
}

.bo-tiles.is-dense {
  gap: var(--ek-space-3);
}

.bo-tiles > :deep(*) {
  height: 100%;
  min-width: 0;
}

.bo-tiles > :deep([data-span='2']) {
  grid-column: span 2;
}

.bo-tiles > :deep([data-span='all']) {
  grid-column: 1 / -1;
}

@media (max-width: 1023px) {
  .bo-tiles:not(.is-auto) {
    grid-template-columns: repeat(min(var(--bo-tiles-cols), 2), minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .bo-tiles:not(.is-auto) {
    grid-template-columns: repeat(var(--bo-tiles-mobile), minmax(0, 1fr));
  }

  .bo-tiles > :deep([data-span='2']) {
    grid-column: auto;
  }
}
</style>
