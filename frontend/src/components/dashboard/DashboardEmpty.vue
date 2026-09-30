<!--
  Dashboard kartı içi dürüst boş durum: ikon kapsülü + başlık + kısa açıklama (+ isteğe bağlı eylem).
  Sayı uydurmaz; "veri yok" ile "her şey yolunda" ayrımı `tone` ile verilir (success = sorun yok).
-->
<template>
  <div class="dash-empty" :class="{ 'dash-empty--compact': compact }">
    <EkIconTile :icon="icon" :tone="tone" :size="compact ? 'md' : 'lg'" />
    <p class="dash-empty__title">{{ title }}</p>
    <p v-if="text" class="dash-empty__text">{{ text }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { EkIconTile, type EkTone } from '@entegrasyonik/ui/components'

withDefaults(defineProps<{ icon: string; title: string; text?: string; tone?: EkTone; compact?: boolean }>(), {
  tone: 'neutral',
  compact: false,
})
</script>

<style scoped>
.dash-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-2);
  min-height: 200px;
  padding: var(--ek-space-6) var(--ek-space-4);
  text-align: center;
}

.dash-empty--compact {
  min-height: 0;
  padding: var(--ek-space-5) var(--ek-space-4);
}

.dash-empty__title {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.dash-empty__text {
  margin: 0;
  max-width: 340px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
</style>
