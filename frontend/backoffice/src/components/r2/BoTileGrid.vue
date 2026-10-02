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
  bo-wdg: otomatik kipte kap tek sütuna düşünce (dar bölüm) `data-span="2"` örtük ikinci sütun açıp taşırıyordu → kap
  genişliği izlenir, tek sütunda geniş kutu tek hücre olur.
-->
<template>
  <div ref="el" class="bo-tiles" :class="{ 'is-dense': dense, 'is-auto': !cols, 'is-single': single }" :style="style" data-bo-tiles>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ cols?: 1 | 2 | 3 | 4 | 5 | 6; min?: number; dense?: boolean; mobileCols?: 1 | 2 }>(), {
  min: 260,
  mobileCols: 1,
})

const style = computed(() => ({
  '--bo-tiles-cols': String(props.cols ?? 0),
  '--bo-tiles-min': `${props.min}px`,
  '--bo-tiles-mobile': String(props.mobileCols),
}))

// Otomatik kip: iki sütun sığmıyor mu (genişlik < 2 × min + boşluk)? Sabit `cols` kipinde kırılımlar CSS'te.
const el = ref<HTMLElement | null>(null)
const single = ref(false)
let ro: ResizeObserver | undefined
function measure() {
  const node = el.value
  if (!node || props.cols) return
  const gap = parseFloat(getComputedStyle(node).columnGap) || 0
  single.value = node.clientWidth < 2 * props.min + gap
}
onMounted(() => {
  if (props.cols || typeof ResizeObserver !== 'function') return
  ro = new ResizeObserver(measure)
  if (el.value) ro.observe(el.value)
  measure()
})
onBeforeUnmount(() => ro?.disconnect())
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

.bo-tiles.is-auto.is-single > :deep([data-span='2']) {
  grid-column: auto;
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
