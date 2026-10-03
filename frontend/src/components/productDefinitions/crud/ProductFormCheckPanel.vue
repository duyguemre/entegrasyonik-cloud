<!--
  frontend/src/components/productDefinitions/crud/ProductFormCheckPanel.vue

  Kayıt öncesi kontrol paneli (ProductFormWizardBar'dan ayrıldı, FE-LOCAL-1002b): eksik zorunlu bilgiler + uyarılar
  + kayıt özeti. Çubuk akıştayken çubuğun İÇİNDE, sayfa başlığına taşındığında açılır pencerede (v-menu) gösterilir.
  Maddeye tıklama `issue` yayar (çubuk ilgili adıma/alana gider).
-->
<template>
  <div class="pfw-panel" role="region" aria-label="Kayıt öncesi kontrol">
    <div class="pfw-panel__col">
      <h3 class="pfw-panel__heading">
        Eksik zorunlu bilgiler
        <EkStatusChip v-if="progress.missing.length" tone="warning" :label="`${progress.missing.length} eksik`" />
        <EkStatusChip v-else tone="success" label="Tamam" />
      </h3>
      <ul v-if="progress.missing.length" class="pfw-issues">
        <li v-for="m in progress.missing" :key="m.key">
          <button type="button" class="pfw-issue" @click="emit('issue', m)">
            <v-icon icon="mdi-alert-circle-outline" size="18" class="pfw-issue__icon pfw-issue__icon--missing" aria-hidden="true" />
            <span class="pfw-issue__label">{{ m.label }}</span>
            <span class="pfw-issue__where">Adım {{ m.step + 1 }}</span>
            <v-icon icon="mdi-chevron-right" size="18" class="pfw-issue__go" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-else class="pfw-panel__ok">
        <v-icon icon="mdi-check-circle-outline" size="18" aria-hidden="true" />
        Tüm zorunlu bilgiler girildi. {{ saveLabel }} düğmesi etkin.
      </p>

      <template v-if="progress.warnings.length">
        <h3 class="pfw-panel__heading pfw-panel__heading--spaced">
          Uyarılar
          <EkStatusChip tone="info" :label="`${progress.warnings.length}`" />
        </h3>
        <ul class="pfw-issues">
          <li v-for="w in progress.warnings" :key="w.key">
            <button type="button" class="pfw-issue" @click="emit('issue', w)">
              <v-icon icon="mdi-information-outline" size="18" class="pfw-issue__icon" aria-hidden="true" />
              <span class="pfw-issue__label">{{ w.label }}</span>
              <span class="pfw-issue__where">Adım {{ w.step + 1 }}</span>
              <v-icon icon="mdi-chevron-right" size="18" class="pfw-issue__go" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </template>
    </div>
    <div class="pfw-panel__col pfw-panel__col--summary">
      <h3 class="pfw-panel__heading">
        <span class="pfw-sum__badge" aria-hidden="true"><v-icon icon="mdi-package-variant-closed" /></span>
        Kayıt özeti
        <EkStatusChip class="pfw-panel__chip" :tone="progress.canSave ? 'success' : 'warning'" :label="progress.canSave ? 'Kayda hazır' : `${progress.requiredDone} / ${progress.requiredTotal}`" />
      </h3>
      <dl class="pfw-sum">
        <div v-for="row in summaryRows" :key="row.label" class="pfw-sum__item" :class="summaryItemClass(row)">
          <dt class="pfw-sum__label">{{ row.label }}</dt>
          <dd class="pfw-sum__value" :class="{ 'ek-num': row.label === 'Toplam stok' || row.label === 'Varyant sayısı' }">{{ row.value }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EkStatusChip } from '@entegrasyonik/ui/components'
import type { ProgressItem } from '@/composables/useProductFormProgress'

defineProps<{
  progress: any
  summaryRows: { label: string; value: string }[]
  saveLabel: string
}>()

const emit = defineEmits<{ issue: [item: ProgressItem] }>()

/** Özet kutucukları: başlık iki sütunu kaplar, toplam stok vurgulu, boş değer sönük. */
function summaryItemClass(row: { label: string; value: string }) {
  return {
    'pfw-sum__item--wide': row.label === 'Ürün başlığı',
    'pfw-sum__item--accent': row.label === 'Toplam stok',
    'is-empty': row.value === '—',
  }
}
</script>

<style scoped>
/* ── kontrol paneli (çubuğun içinde açılır) ──────────────────────────────────────────────────── */
.pfw-panel {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  align-items: stretch;
  gap: var(--ek-space-4);
  max-height: min(60vh, 560px);
  padding: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
  overflow: auto;
  overscroll-behavior: contain;
}

/* İki sütun aynı kart: aynı iç boşluk, aynı başlık yüksekliği, eşit boy (üst ve alt kenarlar hizalı). */
.pfw-panel__col {
  min-width: 0;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

.pfw-panel__heading {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 32px;
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.pfw-panel__heading--spaced {
  margin-top: var(--ek-space-5);
}

.pfw-panel__ok {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-type-label-size);
}

/* Durum hapı başlık satırının sağ ucunda — iki kartta da aynı yerde. */
.pfw-panel__heading > :deep(.ek-status-chip),
.pfw-panel__chip {
  margin-left: auto;
}

/* Eksik/uyarı kutuları ızgarada: eşit genişlik ve yükseklik, satır ve sütun boyunca hizalı. */
.pfw-issues {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: 1fr;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pfw-issue {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  height: 100%;
  min-height: var(--ek-control-h-lg);
  padding: var(--ek-space-1) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pfw-issue:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.pfw-issue:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pfw-issue__icon {
  flex: none;
  color: var(--ek-color-info-emphasis);
}

.pfw-issue__icon--missing {
  color: var(--ek-color-warning-emphasis);
}

.pfw-issue__label {
  flex: 1 1 auto;
  min-width: 0;
}

.pfw-issue__where {
  flex: none;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pfw-issue__go {
  flex: none;
  color: var(--ek-color-content-muted);
}

/* ── kayıt özeti: rozetli başlık + iki sütunlu bilgi kutucukları ─────────────────────────────── */
.pfw-sum__badge {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
}

.pfw-sum__badge :deep(.v-icon) {
  font-size: var(--ek-icon-sm, 18px);
}

.pfw-sum {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-2);
  margin: 0;
}

.pfw-sum__item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  min-height: 60px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.pfw-sum__item--wide {
  grid-column: 1 / -1;
}

.pfw-sum__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-medium);
  letter-spacing: 0.02em;
}

.pfw-sum__value {
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pfw-sum__item.is-empty .pfw-sum__value {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular, 400);
}

/* Toplam stok: aksiyon tonunda vurgulu kutucuk, büyük rakam. */
.pfw-sum__item--accent {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.pfw-sum__item--accent .pfw-sum__label {
  color: var(--ek-color-action);
}

.pfw-sum__item--accent .pfw-sum__value {
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
}

/* Başlıktaki açılır pencere hâli: yüzen kart. */
.pfw-panel--pop {
  width: min(820px, calc(100vw - 32px));
  border: 1px solid var(--ek-color-border-default);
  border-top: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-raised);
}

@media (max-width: 1023px) {
  .pfw-panel {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* FE-LOCAL-1054 — kontrol/özet paneli: açılır kart gölgesi + köşeli "nerede" etiketi. */
.pfw-panel--pop {
  box-shadow: var(--ek-shadow-popover);
}

.pfw-issue__where {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

/* ================= FE-LOCAL-1057 — "Eksik zorunlu bilgiler" / "Kayıt özeti" paneli: uygulamanın tasarım diliyle =================
   Kart içinde kart yok: iki sütun tek yüzeyde, aralarında ince çizgi. Başlıklar kısa eylem çizgili mikro etiket.
   Eksikler tek sütun ince çizgili satırlar (ikon kapsülü + ad + "Adım n" + ok). Özet: ince çizgiyle ayrılan bilgi
   hücreleri (ayrı kutucuklar değil); toplam stok eylem tonunda. */
.pfw-panel {
  gap: 0;
  padding: 0;
  background: var(--ek-color-surface);
}

.pfw-panel__col {
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-5);
  border: 0;
  border-radius: 0;
}

.pfw-panel__col + .pfw-panel__col {
  border-left: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.pfw-panel__heading {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pfw-panel__heading::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.pfw-sum__badge {
  display: none;
}

.pfw-issues {
  grid-template-columns: minmax(0, 1fr);
  grid-auto-rows: auto;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
}

.pfw-issues > li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.pfw-issue {
  min-height: 44px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 0;
  border-radius: 0;
}

.pfw-issue__icon {
  width: 28px;
  height: 28px;
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-info-subtle);
}

.pfw-issue__icon--missing {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
}

.pfw-issue__label {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.pfw-issue:hover .pfw-issue__go {
  color: var(--ek-color-action);
}

.pfw-sum {
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

/* Hücre çizgileri hücrenin kendi sağ/alt kenarında (boş ızgara gözü koyu görünmesin); taşan 1px kap tarafından kırpılır. */
.pfw-sum__item {
  min-height: 52px;
  margin: 0 -1px -1px 0;
  border: 0;
  border-right: 1px solid var(--ek-color-border-subtle);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  border-radius: 0;
  background: var(--ek-color-surface);
}

.pfw-panel__heading :deep(.ek-status-chip) {
  letter-spacing: 0;
  text-transform: none;
}

.pfw-sum__label {
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pfw-sum__item--accent {
  background: var(--ek-color-action-subtle);
}

.pfw-sum__item--accent .pfw-sum__label {
  color: var(--ek-color-action-emphasis);
}

@media (max-width: 1023px) {
  .pfw-panel__col + .pfw-panel__col {
    border-top: 1px solid var(--ek-color-border-default);
    border-left: 0;
  }
}
</style>
