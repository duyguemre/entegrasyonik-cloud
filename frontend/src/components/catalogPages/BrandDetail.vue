<!--
  frontend/src/components/catalogPages/BrandDetail.vue

  B7 — seçili marka detayı (yalnız BrandListView). Üstte özet: baş harf avatarı, ad, platform platform eşleme durumu
  (veri: marka kaydındaki `platforms.<kod>.id`, eşli platform markasının adıyla). Altta MEVCUT `BrandSyncComponent`
  AYNEN (ad düzenle + kaydet/sil, platform marka eşleme) — ortak bileşen değişmedi.
-->
<template>
  <div class="brand-detail">
    <article class="brand-detail__summary" :aria-labelledby="titleId">
      <div class="brand-detail__head">
        <span class="brand-detail__avatar" aria-hidden="true">{{ item.initials }}</span>
        <div class="brand-detail__titles">
          <p class="brand-detail__eyebrow">Marka</p>
          <h2 :id="titleId" class="brand-detail__title">{{ item.title }}</h2>
        </div>
        <EkButton class="brand-detail__close" tone="ghost" size="sm" :icon="icons.close" icon-only aria-label="Seçimi kapat" @click="emit('close')" />
      </div>

      <div class="brand-detail__block">
        <h3 class="brand-detail__label">Pazaryeri eşlemesi</h3>
        <ul v-if="item.mapping.length" class="brand-detail__maps">
          <li v-for="m in item.mapping" :key="m.code" class="brand-detail__map" :class="[channelClass(m.code), m.mapped ? 'is-on' : 'is-off']">
            <span class="brand-detail__map-dot" aria-hidden="true"></span>
            <span class="brand-detail__map-body">
              <span class="brand-detail__map-name">{{ m.name }}</span>
              <span class="brand-detail__map-value">{{ m.mapped ? platformTitle(m.code) : 'Eşlenmedi' }}</span>
            </span>
            <v-icon :icon="m.mapped ? 'mdi-check' : 'mdi-minus'" size="16" class="brand-detail__map-icon" aria-hidden="true" />
          </li>
        </ul>
        <p v-else class="brand-detail__muted">Marka eşlemesi destekleyen bağlı platform yok.</p>
        <p v-if="item.mapping.length && item.mappedCount < item.mapping.length" class="brand-detail__hint">
          <v-icon icon="mdi-arrow-down" size="14" aria-hidden="true" /> Aşağıdaki <strong>Platform Marka Eşleştirme</strong> bölümünden platform seçip eşleyin.
        </p>
      </div>
    </article>

    <div class="brand-detail__sync">
      <BrandSyncComponent v-model="syncModel" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import BrandSyncComponent from '@/components/BrandSyncComponent.vue'
import EkButton from '@/components/ds/EkButton.vue'
import { channelClass } from '@/design/channels'
import { icons } from '@/design/icons'
import type { BrandItem } from './catalogModel'

const props = defineProps<{ item: BrandItem }>()
const emit = defineEmits<{ close: [] }>()
const titleId = `brand-detail-title-${useId()}`

const platformTitle = (code: string) => {
  const p = props.item.raw?.platforms?.[code]
  return p?.title || p?.name || 'Eşli'
}

// Mevcut panel yalnız `_id` ile depodan okur (BrandSyncComponent.reset).
const syncModel = ref<any>({ _id: props.item.id })
watch(
  () => props.item.id,
  (id) => (syncModel.value = { _id: id }),
)
</script>

<style scoped>
.brand-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}

.brand-detail__summary {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.brand-detail__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}

.brand-detail__avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.02em;
}

.brand-detail__titles {
  flex: 1;
  min-width: 0;
}

.brand-detail__eyebrow {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.brand-detail__title {
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-detail__close {
  flex: none;
  align-self: flex-start;
}

.brand-detail__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.brand-detail__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.brand-detail__maps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.brand-detail__map {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 48px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
}

.brand-detail__map.is-off {
  border-style: dashed;
  background: transparent;
}

.brand-detail__map-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  box-sizing: border-box;
}

.brand-detail__map.is-on .brand-detail__map-dot {
  background: var(--ek-ch-solid);
}

.brand-detail__map.is-off .brand-detail__map-dot {
  border: 1.5px solid var(--ek-color-border-strong);
}

.brand-detail__map-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.brand-detail__map-name {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-type-label-weight);
}

.brand-detail__map-value {
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-detail__map.is-on .brand-detail__map-icon {
  color: var(--ek-color-success-emphasis);
}

.brand-detail__map.is-off .brand-detail__map-name {
  color: var(--ek-color-content-muted);
}

.brand-detail__map-icon {
  flex: none;
  color: var(--ek-color-content-muted);
}

.brand-detail__hint,
.brand-detail__muted {
  display: block;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.brand-detail__hint .v-icon {
  margin-right: 2px;
  vertical-align: -2px;
}

.brand-detail__hint strong {
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-semibold);
}

/* Mevcut panelin eski iki bölmeli yerleşime göre dış boşluğu bu sarmalayıcıda sıfırlanır. */
.brand-detail__sync :deep(.ek-brand-sync) {
  padding: 0;
}

/* Dar kapta (tek bölme) üstteki "← Tüm …" bağlantısı zaten var → kapat düğmesi gizlenir. */
@container (max-width: 919px) {
  .brand-detail__close {
    display: none;
  }
}
</style>
