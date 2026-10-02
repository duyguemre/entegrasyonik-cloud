<!--
  frontend/src/components/productDefinitions/crud/ProductStepCard.vue

  Ürün sihirbazı ADIM SAYFASI başlığı + gövdesi (Kategori · Ürün Tanımı · Tekil Ürün Bilgisi · Detay Bilgiler).
  FE R4 B'de tek büyük kart kabuğuydu; FE R5 B'de kart kalktı: üstte adım başlığı (mikro "Adım n / 4" + h2 + kısa açıklama
  + sağda isteğe bağlı eylemler), altında bölüm KARTLARI (`ProductFormSection`) dikey yığın. Genişlik görünümün içerik
  sütunundan gelir. Yalnız sunum; alanlar ve v-model bağları adım bileşenlerinde kalır.
-->
<template>
  <section class="pstep" :aria-labelledby="`${uid}-title`">
    <header class="pstep__head">
      <EkIconTile :icon="icon" size="lg" class="pstep__icon" />
      <div class="pstep__titles">
        <span v-if="step" class="pstep__eyebrow ek-num">Adım {{ step }} / 4</span>
        <h2 :id="`${uid}-title`" class="pstep__title">{{ title }}</h2>
        <p v-if="description" class="pstep__desc">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="pstep__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="pstep__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import { EkIconTile } from '@entegrasyonik/ui/components'

defineProps<{
  title: string
  icon: string
  description?: string
  /** 1 tabanlı adım numarası (mikro etiket); verilmezse gösterilmez. */
  step?: number
}>()

const uid = useId()
</script>

<style scoped>
.pstep {
  min-width: 0;
}

.pstep__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  margin-bottom: var(--ek-space-5);
}

.pstep__titles {
  flex: 1 1 0;
  min-width: 0;
}

.pstep__eyebrow {
  display: block;
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pstep__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: var(--ek-type-title-tracking, normal);
  text-wrap: balance;
}

.pstep__desc {
  margin: 2px 0 0;
  max-width: 72ch;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  text-wrap: pretty;
}

.pstep__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
}

.pstep__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}

@container pform (max-width: 599px) {
  .pstep__head {
    flex-wrap: wrap;
    gap: var(--ek-space-3);
    margin-bottom: var(--ek-space-4);
  }

  .pstep__icon {
    display: none;
  }

  .pstep__title {
    font-size: var(--ek-type-heading-size);
    line-height: var(--ek-type-heading-line);
  }

  .pstep__desc {
    font-size: var(--ek-type-caption-size);
    line-height: var(--ek-type-caption-line);
  }

  .pstep__actions {
    width: 100%;
  }

  .pstep__actions > :deep(*) {
    flex: 1 1 auto;
  }
}
</style>
