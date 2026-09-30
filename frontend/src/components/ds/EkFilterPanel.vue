<!--
  frontend/src/components/ds/EkFilterPanel.vue

  DS-v2 — sayfa İÇİ filtre paneli (tüm sayfayı kaplayan popup DEĞİL). TÜM listelerde tek filtre bileşeni.
  Bir sekmenin filtresi yalnızca o sekmeyi etkiler. Yapı (A8 — premium başlık):

    başlık çubuğu (`surface-muted` + ince alt kenar, gövdeyle tek parça; hover/odak):
      [⧩] Filtreler (2) │ Durum: Onay bekliyor × · Kanal: Trendyol × · +1 │ Temizle │ [#head-actions] │ ⌄
       └ düğme: aria-expanded / aria-controls, Enter/Space      └ `chips` verilirse (kapalıyken de görünür)
      Başlığın boş alanına tıklamak da aç/kapar (fare kolaylığı; klavye yolu düğme). Chevron yumuşak döner.
      < 600px kapta çip özeti ikinci satıra iner (başlık çubuğunun içinde kalır).
    gövde (`surface-sunken`): EkFormGrid (varsayılan 4 kolon) — slot
    eylem çubuğu: [#extra-actions] ........ Temizle (ikincil) · Sorgula (birincil)

  Enter bir alandayken Sorgula'yı tetikler (native form submit).
  `chips` (A8): etkin filtre çipleri başlıktaki `EkActiveFilters variant="compact"` ile gösterilir (`remove-chip`,
  `clear`); verilmezse başlık yalnız sayıyı gösterir. `#head-actions`: başlığın sağında, daraltılmışken de görünen
  küçük eylemler (ör. `EkSavedViews` "Görünümler" menüsü — kayıtlı görünüm seçicinin yeri).
-->
<template>
  <section
    class="ek-filter"
    :class="{ 'is-collapsed': collapsed, 'has-active': activeCount > 0, 'has-chips': chips.length > 0 }"
    :aria-labelledby="titleId"
  >
    <header class="ek-filter__head" @click="onHeadClick">
      <component :is="`h${headingLevel}`" :id="titleId" class="ek-filter__heading">
        <button
          ref="toggleRef"
          type="button"
          class="ek-filter__toggle"
          :aria-expanded="!collapsed"
          :aria-controls="bodyId"
          @click.stop="toggle"
        >
          <span class="ek-filter__glyph" aria-hidden="true"><v-icon :icon="icons.filter" /></span>
          <span class="ek-filter__title">{{ title }}</span>
          <span v-if="activeCount" class="ek-filter__count ek-num" aria-hidden="true">{{ activeCount }}</span>
          <span class="ek-sr-only">, {{ filterCountText(activeCount) }}</span>
        </button>
      </component>

      <div class="ek-filter__summary" data-filter-interactive>
        <EkActiveFilters v-if="chips.length" variant="compact" :filters="chips" @remove="(k: string) => emit('remove-chip', k)" @clear="emit('clear')" />
        <span v-else-if="!activeCount" class="ek-filter__hint">Tüm kayıtlar gösteriliyor</span>
      </div>

      <div v-if="$slots['head-actions']" class="ek-filter__head-actions" data-filter-interactive><slot name="head-actions" /></div>
      <span class="ek-filter__chevron" aria-hidden="true"><v-icon icon="mdi-chevron-down" /></span>
    </header>
    <!-- Aşama 5: aç/kapa `EkCollapse` (yükseklik + opaklık, 200ms; reduced-motion'da anında; içerik zıplamaz). -->
    <EkCollapse :open="!collapsed">
    <form :id="bodyId" class="ek-filter__form" @submit.prevent="emit('submit')" @reset.prevent="emit('reset')">
      <div class="ek-filter__body">
        <EkFormGrid :columns="columns">
          <slot />
        </EkFormGrid>
      </div>
      <div class="ek-filter__actions">
        <div class="ek-filter__extra"><slot name="extra-actions" /></div>
        <EkButton type="reset" tone="secondary" :icon="icons.clearFilters" :disabled="!activeCount">Temizle</EkButton>
        <EkButton type="submit" tone="primary" :icon="icons.search" :loading="loading">Sorgula</EkButton>
      </div>
    </form>
    </EkCollapse>
  </section>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'
import EkButton from './EkButton.vue'
import EkFormGrid from './EkFormGrid.vue'
import EkCollapse from './EkCollapse.vue'
import EkActiveFilters, { type EkActiveFilterChip } from './EkActiveFilters.vue'
import { icons } from '@/design/icons'
import { filterCountText } from './filterHeader'

const props = withDefaults(
  defineProps<{
    title?: string
    activeCount?: number
    collapsed?: boolean
    loading?: boolean
    columns?: 1 | 2 | 3 | 4
    headingLevel?: 2 | 3 | 4
    /** A8: etkin filtre çipleri — başlıkta kompakt özet (kapalıyken de görünür). */
    chips?: EkActiveFilterChip[]
  }>(),
  { title: 'Filtreler', activeCount: 0, collapsed: false, loading: false, columns: 4, headingLevel: 2, chips: () => [] },
)

const emit = defineEmits<{ 'update:collapsed': [value: boolean]; submit: []; reset: []; 'remove-chip': [key: string]; clear: [] }>()
const uid = useId()
const titleId = `ek-filter-title-${uid}`
const bodyId = `ek-filter-body-${uid}`
const toggleRef = ref<HTMLButtonElement | null>(null)

function toggle() {
  emit('update:collapsed', !props.collapsed)
}

/** Başlığın boş alanı / chevron tıklaması (fare): etkileşimli alt öğelerden gelen tıklamalar hariç. */
function onHeadClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null
  if (t?.closest('[data-filter-interactive] button, [data-filter-interactive] a, [data-filter-interactive] input, [data-filter-interactive] [role="button"]')) return
  toggle()
  toggleRef.value?.focus({ preventScroll: true })
}
</script>

<style scoped>
.ek-filter {
  container-type: inline-size;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
}

/* ── Başlık çubuğu ─────────────────────────────────────────────────────────── */
.ek-filter__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 48px;
  padding: var(--ek-space-1) var(--ek-space-2) var(--ek-space-1) var(--ek-space-2);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-filter.is-collapsed .ek-filter__head {
  border-bottom-color: transparent;
}

.ek-filter__head:hover {
  background: var(--ek-color-surface-sunken);
}

.ek-filter__head:has(.ek-filter__toggle:focus-visible) {
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-filter__heading {
  flex: none;
  min-width: 0;
  margin: 0;
  font-size: inherit;
}

.ek-filter__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: 36px;
  padding: 0 var(--ek-space-2) 0 var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-strong);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.ek-filter__toggle:focus-visible {
  outline: none;
}

.ek-filter__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-default);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  transition: var(--ek-transition-colors);
}

.ek-filter.has-active .ek-filter__glyph {
  background: var(--ek-color-action-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-color-action-border);
  color: var(--ek-color-action);
}

.ek-filter__title {
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-filter__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-bold);
  line-height: 1;
}

/* Özet: başlıkla ince ayraçla ayrılır; kalan genişliği alır. */
.ek-filter__summary {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  padding-left: var(--ek-space-3);
  cursor: default;
}

.ek-filter__summary::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  height: 20px;
  border-left: 1px solid var(--ek-color-border-default);
  transform: translateY(-50%);
}

.ek-filter__summary > * {
  flex: 1 1 auto;
  min-width: 0;
}

.ek-filter__hint {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.ek-filter__head-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
  cursor: default;
}

.ek-filter__chevron {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-lg);
  transition:
    transform var(--ek-duration-base) var(--ek-easing-standard),
    background-color var(--ek-duration-fast) var(--ek-easing-standard),
    color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-filter__head:hover .ek-filter__chevron {
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
}

.ek-filter:not(.is-collapsed) .ek-filter__chevron {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .ek-filter__chevron {
    transition: none;
  }
}

/* Dar kap: başlık satırı [⧩ Filtreler (n) … görünümler ⌄]; çip özeti altta tam genişlik (başlık çubuğunun içinde). */
@container (max-width: 599px) {
  .ek-filter__head {
    flex-wrap: wrap;
    row-gap: 0;
    column-gap: var(--ek-space-2);
  }

  .ek-filter__heading {
    flex: 1 1 auto;
  }

  .ek-filter__summary {
    order: 3;
    flex-basis: 100%;
    padding: 0 var(--ek-space-1) var(--ek-space-1);
  }

  .ek-filter__summary::before {
    display: none;
  }

  .ek-filter:not(.has-chips) .ek-filter__summary {
    display: none;
  }
}

/* ── Gövde ─────────────────────────────────────────────────────────────────── */
.ek-filter__body {
  padding: var(--ek-space-4);
  background: var(--ek-color-surface-sunken);
}

/* Aşama 4: eylem çubuğu gövdenin DEVAMI (aynı sunken yüzey, ayraç yok) — alanlar ile Sorgula tek blok okunur. */
.ek-filter__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  padding: 0 var(--ek-space-4) var(--ek-space-4);
  background: var(--ek-color-surface-sunken);
}

.ek-filter__extra {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: var(--ek-space-2);
}
</style>
