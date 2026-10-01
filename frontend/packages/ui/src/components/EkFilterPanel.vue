<!--
  frontend/src/components/ds/EkFilterPanel.vue

  DS-v2 — sayfa İÇİ filtre paneli (tüm sayfayı kaplayan popup DEĞİL). TÜM listelerde tek filtre bileşeni.
  Bir sekmenin filtresi yalnızca o sekmeyi etkiler. Yapı (A8 — premium başlık):

    başlık çubuğu (`surface-muted` + ince alt kenar, gövdeyle tek parça; hover/odak):
      [⧩] Filtreler (2) │ Durum: Onay bekliyor × · Kanal: Trendyol × · +1 │ Temizle │ [#head-actions] │ ⌄
       └ düğme: aria-expanded / aria-controls, Enter/Space      └ `chips` verilirse (kapalıyken de görünür)
      Başlığın boş alanına tıklamak da aç/kapar (fare kolaylığı; klavye yolu düğme). Chevron yumuşak döner.
      < 600px kapta çip özeti ikinci satıra iner (başlık çubuğunun içinde kalır).
    gövde (`surface-muted`): EkFormGrid (varsayılan 4 kolon) — slot
    eylem çubuğu (`surface` + ince üst ayraç): [#extra-actions | "Enter ile sorgula"] ..... Temizle (ghost) · Sorgula (birincil)
  FR2-SHELL madde 9 (fe-r2a): başlık çubuğu beyaz yüzey, gövde hafif tonlu, eylemler ayrı ayraçlı çubukta — üç katman
  (ne süzülüyor / alanlar / işlem) göz yormadan ayrışır. frontend/docs/FR2_PATTERNS.md §4.

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
      <!-- Araç çubuğu düzeni: [arama] [⧩ Filtreler n ⌄] │ çipler … [#head-actions] — arama her zaman açık, birincil. -->
      <div v-if="$slots['head-search']" class="ek-filter__search" data-filter-interactive @click.stop><slot name="head-search" /></div>
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
          <span class="ek-filter__chevron" aria-hidden="true"><v-icon icon="mdi-chevron-down" /></span>
        </button>
      </component>


      <div class="ek-filter__summary" data-filter-interactive>
        <EkActiveFilters v-if="chips.length" variant="compact" :filters="chips" @remove="(k: string) => emit('remove-chip', k)" @clear="emit('clear')" />
        <span v-else-if="!activeCount" class="ek-filter__hint">Tüm kayıtlar gösteriliyor</span>
      </div>

      <div v-if="$slots['head-actions']" class="ek-filter__head-actions" data-filter-interactive><slot name="head-actions" /></div>
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
        <div class="ek-filter__extra">
          <slot name="extra-actions" />
        </div>
        <EkButton type="reset" tone="ghost" :icon="icons.clearFilters" :disabled="!activeCount">Temizle</EkButton>
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
import { icons } from '../icons'
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
/* FR3 madde 6 (fe-r3a): başlık kompakt — 52 → 44px (kontrol `sm` 32 + 2×6), karo 32 → 24px; dikeyde ~16px kazanç
   (başlık + gövde + eylem çubuğu). Yapı ve davranış aynı (A8). */
.ek-filter__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 44px;
  padding: 6px var(--ek-space-3) 6px var(--ek-space-2);
  background: var(--ek-color-surface);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-filter.is-collapsed .ek-filter__head {
  border-bottom-color: transparent;
}

.ek-filter__head:hover {
  background: var(--ek-color-surface-muted);
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
  height: var(--ek-control-h-sm);
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
  box-shadow: var(--ek-focus-ring);
}

.ek-filter__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-muted);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-subtle);
  color: var(--ek-color-content-default);
  font-size: var(--ek-icon-xs);
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
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  transition:
    transform var(--ek-motion-reveal),
    background-color var(--ek-motion-feedback),
    color var(--ek-motion-feedback);
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

/* Arama: başlıkta solda birincil öğe; sonrasında Filtreler düğmesi + çipler aynı satırda. */
.ek-filter__search {
  position: relative;
  display: flex;
  flex: 0 1 360px;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 200px;
  padding-left: var(--ek-space-3);
  cursor: default;
}

/* Başlık ile arama arasında kısa dikey ayraç — iki öğe tek şeritte ama ayrı roller. */
.ek-filter__search::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 1px;
  height: 20px;
  transform: translateY(-50%);
  background: var(--ek-color-border-subtle);
}

.ek-filter__search > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}

@container (max-width: 599px) {
  .ek-filter__search {
    flex: 1 1 100%;
    order: 2;
    min-width: 0;
    padding: 0 0 var(--ek-space-1);
  }

  .ek-filter__search::before {
    display: none;
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
  background: var(--ek-color-surface-muted);
}

/* Aşama 4: eylem çubuğu gövdenin DEVAMI (aynı sunken yüzey, ayraç yok) — alanlar ile Sorgula tek blok okunur. */
.ek-filter__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-4);
  background: var(--ek-color-surface);
  border-top: 1px solid var(--ek-color-border-subtle);
}

/* FR2 madde 9: eylem çubuğunun solunda sessiz klavye ipucu (ekran kendi ek eylemini vermediyse). */
.ek-filter__enter-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted); /* metin: AA (subtle yalnız dekoratif) */
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-filter__enter-hint kbd {
  padding: 0 var(--ek-space-1);
  border: 1px solid var(--ek-color-border-default);
  border-bottom-width: 2px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-family: inherit;
  font-size: var(--ek-type-micro-size);
  line-height: 16px;
}

@container (max-width: 599px) {
  .ek-filter__enter-hint {
    display: none;
  }
}

.ek-filter__extra {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: var(--ek-space-2);
}

/* ── Araç çubuğu düzeni (oturum düzenlemesi) ───────────────────────────────────────────────────────────────────
   [🔍 arama] [⧩ Filtreler n ⌄] │ çipler …  — arama solda ve her zaman açık; "Filtreler" çerçeveli küçük DÜĞME
   (başlık değil), paneli açar/kapar, ok düğmenin içinde. Başlık şeridinin hover zemini kalktı (sakin araç çubuğu). */
.ek-filter__head {
  gap: var(--ek-space-2);
  padding: 6px var(--ek-space-2);
}

.ek-filter__head:hover {
  background: var(--ek-color-surface);
}

.ek-filter__search {
  padding-left: 0;
}

.ek-filter__search::before {
  display: none;
}

.ek-filter__toggle {
  gap: 6px;
  height: var(--ek-control-h-sm);
  padding: 0 6px 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  transition: var(--ek-transition-colors);
}

.ek-filter__toggle:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.ek-filter:not(.is-collapsed) .ek-filter__toggle {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.ek-filter__glyph {
  width: auto;
  height: auto;
  background: transparent;
  box-shadow: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ek-filter.has-active .ek-filter__glyph {
  background: transparent;
  box-shadow: none;
  color: var(--ek-color-action);
}

.ek-filter__title {
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-medium);
}

.ek-filter__count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
}

.ek-filter__toggle .ek-filter__chevron {
  width: 18px;
  height: 18px;
  font-size: var(--ek-icon-sm);
}

.ek-filter__head:hover .ek-filter__chevron {
  background: transparent;
}

/* Gövdenin eylem satırı: solda ek eylemler (ör. Görünümler), sağda Temizle · Sorgula. */
.ek-filter__actions {
  justify-content: flex-end;
}

/* Dar kap: arama ilk satırda tam genişlik; altında [Filtreler] + çipler. */
@container (max-width: 599px) {
  .ek-filter__search {
    order: 0;
    padding: 0;
  }

  .ek-filter__heading {
    order: 1;
    flex: none;
  }

  .ek-filter__summary {
    order: 2;
    flex: 1 1 0;
    flex-basis: auto;
    padding: 0;
  }

  .ek-filter__head-actions {
    order: 3;
    margin-left: auto;
  }
}

/* ── Çerçevesiz araç çubuğu (oturum kararı) ────────────────────────────────────────────────────────────────────
   Dış kart kalktı: [arama] [⧩ Filtreler ⌄] │ çipler doğrudan sayfa zemininde (filtresiz listelerin şeridiyle aynı).
   "Filtreler"e basınca alanlar + Temizle/Sorgula ALTTA ayrı bir kart olarak açılır. */
.ek-filter {
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

/* "Filtreler" düğmesi yanındaki arama alanıyla AYNI yükseklikte (alan yüksekliği token'ı). */
.ek-filter__toggle {
  height: var(--ek-control-h-field);
  padding: 0 8px 0 12px;
  /* Çerçeve = arama alanının çerçevesi (vuetify-overrides: border-input; hover content-muted). */
  border-color: var(--ek-color-border-input);
}

.ek-filter__toggle:hover,
.ek-filter:not(.is-collapsed) .ek-filter__toggle {
  border-color: var(--ek-color-content-muted);
}

.ek-filter__head,
.ek-filter__head:hover {
  min-height: 0;
  padding: 0;
  border-bottom: 0;
  background: transparent;
}

.ek-filter__form {
  margin-top: var(--ek-space-2);
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}
</style>
