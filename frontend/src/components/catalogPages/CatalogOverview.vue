<!--
  frontend/src/components/catalogPages/CatalogOverview.vue

  B7 — seçim yokken detay bölmesi (Kategoriler ve Markalar ortak): sayılar, platform başına eşleme kapsaması,
  "eksikleri göster" kısayolu ve klavye ipuçları. Kategoriler için ek yuva (#extra): otomatik eşleştirme (mevcut uç nokta).
  Yalnız mevcut verilerden hesaplanır (ürün sayısı yok → gösterilmez).
-->
<template>
  <article class="cat-ov" :aria-labelledby="titleId">
    <header class="cat-ov__head">
      <EkIconTile :icon="icon" tone="action" size="md" />
      <div>
        <h2 :id="titleId" class="cat-ov__title">{{ title }}</h2>
        <p class="cat-ov__lead">{{ lead }}</p>
      </div>
    </header>

    <dl v-if="!empty" class="cat-ov__stats">
      <div v-for="s in stats" :key="s.label" class="cat-ov__stat" :class="s.tone ? `is-${s.tone}` : ''">
        <dt>{{ s.label }}</dt>
        <dd class="ek-num">{{ s.value }}</dd>
      </div>
    </dl>

    <section v-if="coverage.length && !empty" class="cat-ov__section" :aria-labelledby="`${titleId}-cov`">
      <div class="cat-ov__section-head">
        <h3 :id="`${titleId}-cov`" class="cat-ov__label">Pazaryeri eşleme kapsaması</h3>
        <EkButton v-if="missing > 0" tone="secondary" size="sm" icon="mdi-filter-variant" @click="emit('show-missing')">
          Eksik olanları göster
        </EkButton>
      </div>
      <CatCoverage :rows="coverage" :unit="unit" :label="`Platform başına eşli ${unit}`" />
    </section>
    <p v-else-if="!empty" class="cat-ov__muted">
      Bağlı pazaryeri ya da e-ticaret platformu olmadığı için eşleme durumu hesaplanmıyor.
    </p>

    <slot v-if="!empty" name="extra" />

    <footer v-if="!empty" class="cat-ov__keys" aria-label="Klavye kısayolları">
      <span v-for="k in keys" :key="k.label" class="cat-ov__key"><EkKbd :keys="k.keys" />{{ k.label }}</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkKbd from '@/components/ds/EkKbd.vue'
import CatCoverage from './CatCoverage.vue'

defineProps<{
  title: string
  lead: string
  icon: string
  unit: string
  stats: Array<{ label: string; value: number | string; tone?: 'warning' | 'success' }>
  coverage: Array<{ code: string; name: string; mapped: number; total: number }>
  missing: number
  keys: Array<{ keys: string | string[]; label: string }>
  /** Hiç kayıt yok: sayılar/kapsama gizlenir (anlamsız sıfırlar yerine yalnız yönlendirme). */
  empty?: boolean
}>()
const emit = defineEmits<{ 'show-missing': [] }>()
const titleId = `cat-ov-${useId()}`
</script>

<style scoped>
.cat-ov {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.cat-ov__head {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}

.cat-ov__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.cat-ov__lead {
  margin: 2px 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.cat-ov__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
}

.cat-ov__stat {
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.cat-ov__stat dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cat-ov__stat dd {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-type-metric-weight);
}

.cat-ov__stat.is-warning dd {
  color: var(--ek-color-warning-emphasis);
}

.cat-ov__stat.is-success dd {
  color: var(--ek-color-success-emphasis);
}

.cat-ov__section {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding-top: var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.cat-ov__section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.cat-ov__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cat-ov__muted {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

.cat-ov__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-4);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.cat-ov__key {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}
</style>
