<!--
  frontend/src/components/ds/EkSection.vue

  ADR-0015 Karar 6.1 ("Detay" sözleşmesi — `EkDetailSheet` gövde bloğu) +
  Karar 6.2 (başlık hiyerarşisi: bölüm başlığı H2, `lg` 16/600). Basit
  slot'lu bölüm bloğu: başlık + isteğe bağlı açıklama + içerik.

  Kullanım:
    <EkSection title="Teslimat Bilgileri">
      <EkDescriptionList :items="[...]" />
    </EkSection>
-->
<template>
  <section class="ek-section">
    <div v-if="title" class="ek-section__header">
      <h2 class="ek-section__title">{{ title }}</h2>
      <p v-if="description" class="ek-section__description">{{ description }}</p>
    </div>
    <div class="ek-section__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<style scoped>
.ek-section {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-section__header {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ek-section__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  margin: 0;
}

.ek-section__description {
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-muted);
  margin: 0;
}
</style>
