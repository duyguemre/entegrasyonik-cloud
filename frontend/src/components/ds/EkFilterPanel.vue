<!--
  frontend/src/components/ds/EkFilterPanel.vue

  DS-v2 — sayfa İÇİ filtre paneli (tüm sayfayı kaplayan popup DEĞİL).
  Bir sekmenin filtresi yalnızca o sekmeyi etkiler. Yapı:
    başlık: [ikon] Filtreler [n aktif] ........................ [daralt ⌃]
    gövde (`surface-sunken`): EkFormGrid (varsayılan 4 kolon) — slot
    eylem çubuğu: [#extra-actions] ........ Temizle (ikincil) · Sorgula (birincil)
  Enter bir alandayken Sorgula'yı tetikler (native form submit).
  Daraltılınca yalnız başlık kalır; aktif filtreler `EkActiveFilters` ile
  panelin altında görünür kalır.
  C2.4 (geri uyumlu): `#head-actions` — başlığın sağında, panel daraltılmışken de
  görünen küçük eylemler (ör. `EkSavedViews` "Görünümler" menüsü).
-->
<template>
  <section class="ek-filter" :class="{ 'is-collapsed': collapsed }" :aria-labelledby="titleId">
    <header class="ek-filter__head">
      <component :is="`h${headingLevel}`" :id="titleId" class="ek-filter__heading">
        <button
          type="button"
          class="ek-filter__toggle"
          :aria-expanded="!collapsed"
          :aria-controls="bodyId"
          @click="emit('update:collapsed', !collapsed)"
        >
          <v-icon class="ek-filter__icon" icon="mdi-filter-variant" aria-hidden="true" />
          <span class="ek-filter__title">{{ title }}</span>
          <EkBadge v-if="activeCount" variant="count" :text="activeCount" aria-hidden="true" />
          <span class="ek-sr-only">, {{ activeCount }} aktif filtre</span>
          <v-icon class="ek-filter__chevron" :class="{ 'is-collapsed': collapsed }" icon="mdi-chevron-up" aria-hidden="true" />
        </button>
      </component>
      <div v-if="$slots['head-actions']" class="ek-filter__head-actions"><slot name="head-actions" /></div>
    </header>
    <form v-show="!collapsed" :id="bodyId" class="ek-filter__form" @submit.prevent="emit('submit')" @reset.prevent="emit('reset')">
      <div class="ek-filter__body">
        <EkFormGrid :columns="columns">
          <slot />
        </EkFormGrid>
      </div>
      <div class="ek-filter__actions">
        <div class="ek-filter__extra"><slot name="extra-actions" /></div>
        <EkButton type="reset" tone="secondary" icon="mdi-filter-remove-outline" :disabled="!activeCount">Temizle</EkButton>
        <EkButton type="submit" tone="primary" icon="mdi-magnify" :loading="loading">Sorgula</EkButton>
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import EkBadge from './EkBadge.vue'
import EkButton from './EkButton.vue'
import EkFormGrid from './EkFormGrid.vue'

withDefaults(
  defineProps<{
    title?: string
    activeCount?: number
    collapsed?: boolean
    loading?: boolean
    columns?: 1 | 2 | 3 | 4
    headingLevel?: 2 | 3 | 4
  }>(),
  { title: 'Filtreler', activeCount: 0, collapsed: false, loading: false, columns: 4, headingLevel: 2 },
)

const emit = defineEmits<{ 'update:collapsed': [value: boolean]; submit: []; reset: [] }>()
const uid = useId()
const titleId = `ek-filter-title-${uid}`
const bodyId = `ek-filter-body-${uid}`
</script>

<style scoped>
.ek-filter {
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
}

.ek-filter__head {
  display: flex;
  align-items: center;
  border-left: 3px solid var(--ek-color-action);
}

.ek-filter__heading {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: inherit;
}

.ek-filter__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  flex: 1;
  height: 44px;
  padding: 0 var(--ek-space-4);
  border: 0;
  background: transparent;
  color: var(--ek-color-content-strong);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.ek-filter__head-actions {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
  padding: 0 var(--ek-space-2) 0 var(--ek-space-3);
}

/* Daralt okunu başlık eylemlerinden ayıran ince ayraç (iki ok yan yana karışmasın). */
.ek-filter__head-actions::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  height: 20px;
  border-left: 1px solid var(--ek-color-border-default);
  transform: translateY(-50%);
}

.ek-filter__toggle:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-filter__icon {
  color: var(--ek-color-action);
  font-size: var(--ek-icon-md);
}

.ek-filter__title {
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-filter__chevron {
  margin-left: auto;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  transition: transform var(--ek-duration-base) var(--ek-easing-standard);
}

.ek-filter__chevron.is-collapsed {
  transform: rotate(180deg);
}

.ek-filter__body {
  padding: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-sunken);
}

/* Aşama 4: eylem çubuğu gövdenin DEVAMI (aynı sunken yüzey, ayraç yok) — alanlar ile Sorgula tek blok okunur. */
.ek-filter__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  padding: 0 var(--ek-space-4) var(--ek-space-4);
  background: var(--ek-color-surface-sunken);
}

.ek-filter__actions {
  flex-wrap: wrap;
}

.ek-filter__extra {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: var(--ek-space-2);
}
</style>
