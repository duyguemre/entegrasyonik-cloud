<!--
  frontend/src/components/integrations/IntegrationLoadingBlock.vue

  Pazaryeri verisi yüklenirken sade iskelet + GÖRÜNÜR metin ("Trendyol kategorileri alınıyor…") —
  sıçramayan, dönen ikon yok. `role="status"` + `aria-busy`: ekran okuyucu yüklemeyi duyurur.
-->
<template>
  <div class="ek-int-loading" role="status" aria-busy="true" data-testid="integration-loading">
    <p class="ek-int-loading__text">{{ label }}</p>
    <v-skeleton-loader type="text, text" class="ek-int-loading__skeleton" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<style scoped>
.ek-int-loading {
  padding: var(--ek-space-3) 0;
}

.ek-int-loading__text {
  margin: 0 0 var(--ek-space-2);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.ek-int-loading__skeleton {
  background: transparent;
}
</style>
