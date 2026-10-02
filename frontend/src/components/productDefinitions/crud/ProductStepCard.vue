<!--
  frontend/src/components/productDefinitions/crud/ProductStepCard.vue

  FE R4 Şerit B — ürün sihirbazı adım kartı (Ürün Tanımı · Tekil Ürün Bilgisi · Detay Bilgiler). Önceden her adım kendi
  kart kabuğunu kuruyordu (genişlikler 880/1200, başlık motifi farklı); artık tek kabuk: ikon kapsülü + başlık (h2) +
  açıklama + sağda isteğe bağlı eylemler, altında gövde. Genişlik çağıranın akışından gelir (sihirbazla aynı sütun).
  Yalnız sunum; alanlar ve v-model bağları adım bileşenlerinde kalır.
-->
<template>
  <section class="pstep" :aria-labelledby="`${uid}-title`">
    <header class="pstep__head">
      <EkIconTile :icon="icon" size="md" />
      <div class="pstep__titles">
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
}>()

const uid = useId()
</script>

<style scoped>
.pstep {
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.pstep__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-6);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.pstep__titles {
  flex: 1 1 0;
  min-width: 0;
}

.pstep__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  text-wrap: balance;
}

.pstep__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-wrap: pretty;
}

.pstep__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
}

.pstep__body {
  padding: var(--ek-space-6);
}

@media (max-width: 599px) {
  .pstep__head {
    flex-wrap: wrap;
    padding: var(--ek-space-4);
  }

  .pstep__actions {
    width: 100%;
  }

  .pstep__actions > :deep(*) {
    flex: 1 1 auto;
  }

  .pstep__body {
    padding: var(--ek-space-4);
  }
}
</style>
