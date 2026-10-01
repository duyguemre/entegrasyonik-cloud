<!--
  frontend/src/views/secure/definitions/LegacyDefinitionEmpty.vue

  FE-CFG-3 (ADR-0031) — eski/prototip tanım ekranlarının ortak gövdesi. Bu 7 ekran (Brand/Hashtag/Option/
  Customer/Invoice/Order/Return DefinitionView) önceden API'ye bağlı olmayan, kişisel veriye benzeyen sabit
  demo satırlarından oluşan bir "müşteri" tablosu basıyordu (envanter F21). Demo verisi silindi; ekran yalnız
  sayfa başlığı (her görünümün kendi `EkPageHeader`'ı, `header` yuvası) + boş durum gösterir. Ekranlar canlı menüde yok (`e2e/fixtures/definitionsMenu.ts`); silinmeleri
  ayrı bir ürün kararıdır (PROPOSALS_PENDING).
-->
<template>
  <div class="legacy-definition-root">
    <slot name="header" />
    <div class="legacy-definition-body">
      <EkEmptyState variant="no-data" :title="emptyTitle" :message="emptyMessage" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { EkEmptyState } from '@entegrasyonik/ui/components'

withDefaults(
  defineProps<{
    emptyTitle?: string
    emptyMessage?: string
  }>(),
  {
    emptyTitle: 'Henüz kayıt yok',
    emptyMessage: 'Bu tanım ekranında gösterilecek kayıt bulunmuyor. Kayıtlar ilgili liste ekranından yönetilir.',
  },
)
</script>

<style scoped>
.legacy-definition-root {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.legacy-definition-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ek-space-6);
}
</style>
