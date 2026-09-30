<!--
  frontend/src/components/ds/EkActiveFilters.vue

  DS-v2 — aktif filtre çipleri. Her çip "Etiket: değer ×"; tek tıkla kaldırılır.
  Filtre yoksa hiçbir şey çizilmez (yer kaplamaz). Çip kaldırma düğmesinin erişilebilir adı
  "<Etiket> filtresini kaldır"; temizle düğmesininki "Tümünü temizle" (her iki varyantta aynı — e2e sözleşmesi).

  İki varyant:
    `row` (varsayılan) — "AKTİF FİLTRELER" etiketi + sarılan çipler + "Tümünü temizle" (filtre paneli OLMAYAN listeler).
    `compact` (A8) — `EkFilterPanel` BAŞLIĞINDA tek satır özet: 22px çipler, sığmayanlar "+n" düğmesinde toplanır
      (tıklanınca özet sarılarak tümünü gösterir, `aria-expanded`); sonda "Temizle" metin düğmesi.
      Sığma hesabı görünmez bir ölçüm kopyasından (tüm çipler) yapılır → görünür satır ölçüm döngüsüne girmez.
-->
<template>
  <div
    v-if="filters.length"
    class="ek-active-filters"
    :class="[`ek-active-filters--${variant}`, { 'is-expanded': expanded }]"
    role="group"
    aria-label="Aktif filtreler"
  >
    <span v-if="variant === 'row'" class="ek-active-filters__label">Aktif filtreler</span>

    <div ref="trackRef" class="ek-active-filters__track">
      <span
        v-for="(f, i) in filters"
        v-show="variant === 'row' || expanded || i < fitCount"
        :key="f.key"
        class="ek-active-filters__chip"
        :title="variant === 'compact' ? `${f.label}: ${f.value}` : undefined"
      >
        <span class="ek-active-filters__chip-label">{{ f.label }}:</span>
        <span class="ek-active-filters__chip-value">{{ f.value }}</span>
        <button type="button" class="ek-active-filters__remove" :aria-label="`${f.label} filtresini kaldır`" @click="emit('remove', f.key)">
          <v-icon icon="mdi-close" aria-hidden="true" />
        </button>
      </span>
      <button
        v-if="variant === 'compact' && (hiddenCount > 0 || expanded)"
        type="button"
        class="ek-active-filters__more"
        :aria-expanded="expanded"
        :aria-label="overflowLabel(hiddenCount, expanded).aria"
        @click="expanded = !expanded"
      >
        {{ overflowLabel(hiddenCount, expanded).text }}
      </button>
    </div>

    <button
      type="button"
      class="ek-active-filters__clear"
      :aria-label="variant === 'compact' ? 'Tümünü temizle' : undefined"
      @click="emit('clear')"
    >
      {{ variant === 'compact' ? 'Temizle' : 'Tümünü temizle' }}
    </button>

    <!-- Ölçüm kopyası (yalnız compact): tüm çipler tek satırda, görünmez; sığma hesabı buradan. -->
    <div v-if="variant === 'compact'" ref="measureRef" class="ek-active-filters__measure" aria-hidden="true" inert>
      <span v-for="f in filters" :key="f.key" class="ek-active-filters__chip">
        <span class="ek-active-filters__chip-label">{{ f.label }}:</span>
        <span class="ek-active-filters__chip-value">{{ f.value }}</span>
        <span class="ek-active-filters__remove"><v-icon icon="mdi-close" /></span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fitChipCount, overflowLabel } from './filterHeader'

export interface EkActiveFilterChip {
  key: string
  label: string
  value: string
}

const props = withDefaults(defineProps<{ filters: EkActiveFilterChip[]; variant?: 'row' | 'compact' }>(), { variant: 'row' })
const emit = defineEmits<{ remove: [key: string]; clear: [] }>()

const trackRef = ref<HTMLElement | null>(null)
const measureRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
/** Görünür satıra sığan çip sayısı (compact). Ölçüm yoksa (SSR/test) hepsi. */
const fitCount = ref(Number.POSITIVE_INFINITY)
const hiddenCount = computed(() => (props.variant === 'compact' && Number.isFinite(fitCount.value) ? Math.max(0, props.filters.length - fitCount.value) : 0))

/** "+n" düğmesi için ayrılan yer (px) — en geniş hali "+99". */
const MORE_W = 44
const GAP = 6

function measure() {
  if (props.variant !== 'compact') return
  const track = trackRef.value
  const m = measureRef.value
  if (!track || !m) return
  const avail = track.clientWidth
  if (!avail) return
  const widths = (Array.from(m.children) as HTMLElement[]).map((c) => c.getBoundingClientRect().width)
  fitCount.value = fitChipCount(widths, avail, GAP, MORE_W)
}

let ro: ResizeObserver | undefined
let raf = 0
function schedule() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(measure)
}

onMounted(() => {
  if (props.variant !== 'compact') return
  schedule()
  if (typeof ResizeObserver !== 'undefined' && trackRef.value) {
    // Yalnız GENİŞLİK değişince ölç (yükseklik değişimi — sarılma — döngü üretmesin).
    let lastW = -1
    ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      if (w !== lastW) {
        lastW = w
        schedule()
      }
    })
    ro.observe(trackRef.value)
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  cancelAnimationFrame(raf)
})
watch(
  () => props.filters.map((f) => `${f.key}=${f.value}`).join('|'),
  async () => {
    await nextTick()
    schedule()
    if (!props.filters.length) expanded.value = false
  },
)
</script>

<style scoped>
.ek-active-filters {
  position: relative;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-active-filters__track {
  display: contents;
}

.ek-active-filters__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-active-filters__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  max-width: 100%;
  min-width: 0;
  height: var(--ek-app-chip-h-md);
  padding: 0 3px 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  white-space: nowrap;
  transition: var(--ek-transition-colors);
}

/* Aşama 5: çip bütünü hover'da belirginleşir (kaldırılabilir olduğu hissi); kaldırma düğmesi dairesel, çipe ortalı. */
.ek-active-filters__chip:hover,
.ek-active-filters__chip:focus-within {
  border-color: var(--ek-color-action);
}

.ek-active-filters__chip-label {
  flex: none;
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}

.ek-active-filters__chip-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--ek-font-weight-semibold);
}

.ek-active-filters__remove {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 2px;
  border: 0;
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: inherit;
  font-size: var(--ek-icon-xs);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-active-filters__remove:hover {
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.ek-active-filters__remove:focus-visible,
.ek-active-filters__clear:focus-visible,
.ek-active-filters__more:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-active-filters__clear {
  flex: none;
  height: var(--ek-app-chip-h-md);
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-action);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-active-filters__clear:hover {
  background: var(--ek-color-action-subtle);
  text-decoration: underline;
}

/* ── compact (filtre paneli başlığı) ───────────────────────────────────────── */
.ek-active-filters--compact {
  flex-wrap: nowrap;
  gap: var(--ek-space-3);
}

.ek-active-filters--compact .ek-active-filters__track {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.ek-active-filters--compact.is-expanded .ek-active-filters__track {
  flex-wrap: wrap;
  row-gap: var(--ek-space-1);
  padding: 2px 0;
}

.ek-active-filters--compact .ek-active-filters__chip {
  flex: 0 1 auto;
  height: var(--ek-app-chip-h-sm);
  padding: 0 2px 0 var(--ek-space-2);
  gap: 3px;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-active-filters--compact .ek-active-filters__chip-value {
  max-width: 180px;
}

.ek-active-filters--compact .ek-active-filters__remove {
  width: 18px;
  height: 18px;
  margin-left: 0;
  font-size: 12px;
}

.ek-active-filters__more {
  flex: none;
  height: var(--ek-app-chip-h-sm);
  min-width: 32px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-active-filters__more:hover {
  border-color: var(--ek-color-action-border);
  color: var(--ek-color-action-emphasis);
}

.ek-active-filters--compact .ek-active-filters__clear {
  height: var(--ek-app-chip-h-sm);
  padding: 0 var(--ek-space-1);
}

.ek-active-filters__measure {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  gap: 6px;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}

.ek-active-filters__measure .ek-active-filters__chip {
  flex: none;
  height: var(--ek-app-chip-h-sm);
  padding: 0 2px 0 var(--ek-space-2);
  gap: 3px;
}

.ek-active-filters__measure .ek-active-filters__chip-value {
  max-width: 180px;
}

.ek-active-filters__measure .ek-active-filters__remove {
  width: 18px;
  height: 18px;
  margin-left: 0;
  font-size: 12px;
}
</style>
