<!--
  frontend/src/components/ds/templates/EkSettingsSection.vue

  ADR-0015 Karar 3.9.2 — `EkSettingsTemplate` bölüm düzeni: "sol: başlık +
  açıklama (1/3) · sağ: alanlar (2/3)" (mobilde üst üste).

  Kullanım: bkz. `EkSettingsTemplate.vue` başlık yorumu.
-->
<template>
  <section class="ek-settings-section">
    <div class="ek-settings-section__intro">
      <!-- Bağlamsal yardım (faz3-fe-help): başlığın yanında (?) — başlığın erişilebilir adına karışmaz (kardeş öğe). -->
      <div v-if="$slots['title-extra']" class="ek-settings-section__title-row">
        <h2 class="ek-settings-section__title">{{ title }}</h2>
        <slot name="title-extra" />
      </div>
      <h2 v-else class="ek-settings-section__title">{{ title }}</h2>
      <p v-if="description" class="ek-settings-section__description">{{ description }}</p>
    </div>
    <div class="ek-settings-section__fields">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<style scoped>
.ek-settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding-bottom: var(--ek-space-8);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-settings-section:last-child {
  border-bottom: none;
}

@media (min-width: 1024px) {
  .ek-settings-section {
    flex-direction: row;
    gap: var(--ek-space-8);
  }

  .ek-settings-section__intro {
    flex: 0 0 33%;
  }

  .ek-settings-section__fields {
    flex: 1 1 67%;
  }
}

.ek-settings-section__title {
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  color: var(--ek-color-content-strong);
  margin: 0 0 var(--ek-space-1) 0;
}

.ek-settings-section__description {
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-muted);
  margin: 0;
}

.ek-settings-section__fields {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

/* Aşama 3: Vuetify alanları (`.v-input` → `flex: 1 1 auto`) dikey flex'te boş alanı doldurup satır
   yüksekliğine UZUYORDU (tek seçim alanı ~88px). Alanlar kendi yüksekliğinde kalır. */
.ek-settings-section__fields > :deep(*) {
  flex: 0 0 auto;
}
.ek-settings-section__title-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}
</style>
