<!--
  frontend/src/components/user/team/AuthResultBlock.vue

  Faz 3 / C2a — kimliksiz sayfaların (davet kabul, sahiplik devri) sonuç/sorun bloğu: ikon kapsülü · H1 · açıklama ·
  eylemler. Sayfanın normal akışıyla AYNI sol hizada (ortalı boş durum + sola yaslı başlık karışmasın diye).
  `alert` → ekran okuyucuya anında duyurulur (sorun durumları); yoksa `status`.
-->
<template>
  <div class="ek-auth-result" :role="alert ? 'alert' : 'status'">
    <EkIconTile :icon="icon" :tone="tone" size="lg" />
    <h1 class="ek-auth-result__title">{{ title }}</h1>
    <p v-if="text" class="ek-auth-result__text">{{ text }}</p>
    <div v-if="$slots.default" class="ek-auth-result__actions"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { EkIconTile, type EkTone } from '@entegrasyonik/ui/components'

withDefaults(defineProps<{ icon: string; tone?: EkTone; title: string; text?: string; alert?: boolean }>(), { tone: 'info', alert: false })
</script>

<style scoped>
.ek-auth-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-3);
}

.ek-auth-result__title {
  margin: var(--ek-space-1) 0 0;
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: -0.01em;
  color: var(--ek-color-content-strong);
}

.ek-auth-result__text {
  margin: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
}

.ek-auth-result__actions {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-2);
}
</style>
