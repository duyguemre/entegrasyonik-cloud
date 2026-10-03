<!--
  frontend/src/components/page/ListDashSection.vue

  FE-LOCAL-1043 — liste sayfalarının "Özet" görünümündeki (bölüm panosu) bölüm: kart dışı mikro başlık + içerik.
  Ana sayfadaki bölüm başlıklarıyla aynı dil (eylem renginde kısa çizgi + büyük harf mikro etiket).
-->
<template>
  <section class="lds" :aria-labelledby="id">
    <h2 :id="id" class="lds__label">{{ label }}</h2>
    <slot />
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ label: string }>()
const id = `lds-${useId()}`
</script>

<style scoped>
.lds {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-width: 0;
}

.lds__label {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.lds__label::before {
  content: '';
  width: 14px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}
</style>
