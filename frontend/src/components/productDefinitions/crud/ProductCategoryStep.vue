<!--
  frontend/src/components/productDefinitions/crud/ProductCategoryStep.vue

  FE R5 B — ürün sihirbazının "Kategori Seçimi" adım sayfası. Sözleşme `CategorySelectBoxLevelComponent` ile AYNI:
  `v-model` = seçili YAPRAK kategorinin `_id`'si (klasör seçilince `undefined`). Bu bileşen yalnız sunum ekler:
    · adım başlığı (Adım 1 / 4),
    · "Seçili kategori" kartı: kökten yaprağa yol çipleri (son çip onaylı) ya da boş durum yönlendirmesi,
    · kanal eşleşmeleri: bağlı pazaryerleri için kategorinin kanal kategorisiyle eşleşip eşleşmediği (salt okunur,
      `Categories.platforms[kod]`),
    · altında aramalı kademeli seçici (`EkCascadePicker`, değişmedi).
-->
<template>
  <ProductStepCard :step="1" title="Kategori" icon="mdi-file-tree-outline"
    description="Ürünün kataloğunuzdaki yerini seçin; pazaryeri kategorisi ve zorunlu özellikler buna göre belirlenir.">
    <section class="pcs-current" :class="{ 'is-set': !!pathNodes.length }" aria-label="Seçili kategori">
      <span class="pcs-current__icon" aria-hidden="true">
        <v-icon :icon="pathNodes.length ? 'mdi-check-circle-outline' : 'mdi-gesture-tap'" />
      </span>
      <div class="pcs-current__body">
        <span class="pcs-current__label">Seçili kategori</span>
        <ol v-if="pathNodes.length" class="pcs-path">
          <li v-for="(n, i) in pathNodes" :key="n._id" class="pcs-path__item">
            <v-icon v-if="i > 0" class="pcs-path__sep" icon="mdi-chevron-right" aria-hidden="true" />
            <span class="pcs-chip" :class="{ 'is-leaf': i === pathNodes.length - 1 }">{{ n.title }}</span>
          </li>
        </ol>
        <p v-else class="pcs-current__empty">Henüz seçilmedi — aşağıda arayın ya da kademelerden en uçtaki (yaprak) kategoriyi seçin.</p>
      </div>
      <div v-if="pathNodes.length && channels.length" class="pcs-channels">
        <span class="pcs-current__label">Kanal eşleşmesi</span>
        <ul class="pcs-channels__list">
          <li v-for="c in channels" :key="c.code" class="pcs-channel" :class="c.mapped ? 'is-ok' : 'is-missing'">
            <EkPlatformMark :name="c.title" :code="c.code" />
            <span class="pcs-channel__state">
              <v-icon :icon="c.mapped ? 'mdi-check' : 'mdi-minus-circle-outline'" aria-hidden="true" />
              {{ c.mapped ? 'Eşleşti' : 'Eşleşmedi' }}
            </span>
          </li>
        </ul>
      </div>
    </section>

    <CategorySelectBoxLevelComponent v-model="category" />
  </ProductStepCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkPlatformMark } from '@entegrasyonik/ui/components'
import CategorySelectBoxLevelComponent from '@/components/CategorySelectBoxLevelComponent.vue'
import ProductStepCard from './ProductStepCard.vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { categoryRoots, findCategoryTitlePath } from '@/composables/useProductFormPreview'

const category = defineModel<string | undefined>({ default: undefined })

const categoriesStore = useCategoriesStore()
const integrationStore = useIntegrationStore()

const pathNodes = computed(() => findCategoryTitlePath(categoryRoots(categoriesStore.getCategories?.()), category.value))

const channels = computed(() => {
  const record: any = category.value ? categoriesStore.getCategory?.(category.value) : undefined
  const list: any[] = (integrationStore.getClientMarketplaces?.() ?? []).filter((m: any) => m?.type?.code === 'marketplace')
  return list.map((m: any) => ({ code: m.code, title: m.title || m.code, mapped: !!record?.platforms?.[m.code] }))
})
</script>

<style scoped>
.pcs-current {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--ek-space-3) var(--ek-space-4);
  align-items: start;
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.pcs-current.is-set {
  border: 1px solid var(--ek-color-success-border);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.pcs-current__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.is-set .pcs-current__icon {
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.pcs-current__icon :deep(.v-icon) {
  font-size: var(--ek-icon-md);
}

.pcs-current__body {
  min-width: 0;
}

.pcs-current__label {
  display: block;
  margin-bottom: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pcs-current__empty {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.pcs-path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pcs-path__item {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.pcs-path__sep {
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-sm);
}

.pcs-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}

.pcs-chip.is-leaf {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.pcs-channels {
  grid-column: 2;
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.pcs-channels__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pcs-channel {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: 2px var(--ek-space-2) 2px 2px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface);
}

.pcs-channel__state {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.pcs-channel__state :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.is-ok .pcs-channel__state {
  color: var(--ek-color-success-emphasis);
}

.is-missing .pcs-channel__state {
  color: var(--ek-color-warning-emphasis);
}

@container pform (max-width: 599px) {
  .pcs-current {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .pcs-channels {
    grid-column: 1 / -1;
  }
}
</style>
