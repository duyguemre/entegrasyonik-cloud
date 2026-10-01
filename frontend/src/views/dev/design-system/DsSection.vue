<!-- Vitrin bölümü: numara + başlık (H2) + açıklama + içerik. Yalnızca geliştirme vitrini. -->
<template>
  <section :id="id" class="ds-section" :aria-labelledby="`${id}-title`">
    <header class="ds-section__head">
      <span class="ds-section__index">{{ index }}</span>
      <div>
        <h2 :id="`${id}-title`" class="ds-section__title">{{ title }}</h2>
        <p v-if="description" class="ds-section__desc">{{ description }}</p>
      </div>
    </header>
    <div class="ds-section__body"><slot /></div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ id: string; index: string; title: string; description?: string }>()
</script>

<style scoped>
.ds-section {
  scroll-margin-top: var(--ek-space-6);
}

.ds-section__head {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-4);
  margin-bottom: var(--ek-space-5);
}

.ds-section__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--ek-icon-tile-md);
  height: var(--ek-icon-tile-md);
  border-radius: var(--ek-radius-tile);
  /* Marka mürekkebi zemini: light'ta brand = chrome (aynı lacivert); dark'ta brand açık tondur → krom zemin + krom metni (AA). */
  background: var(--ek-color-chrome);
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.ds-section__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: var(--ek-type-title-tracking);
}

.ds-section__desc {
  max-width: 820px;
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ds-section__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}
</style>
