<!--
  frontend/src/components/ds/EkPageHeader.vue

  ADR-0015 Karar 2.3/6.2 — her ekranın İLK öğesi. Sıra SABİTTİR: breadcrumb
  (bölüm / ekran, bölüm adı tıklanabilir DEĞİL) → H1 → açıklama (1 satır,
  isteğe bağlı) → sağda EN FAZLA 1 birincil eylem + ≤2 ikincil eylem + `⋯`
  taşma menüsü. Sayfada TEK H1 burasıdır (axe `heading-order`).

  Kullanım:
    <EkPageHeader
      section="Katalog"
      title="Ürünler"
      description="Tüm kanallardaki ürünlerinizi buradan yönetin."
      :primary-action="{ label: 'Yeni ürün', icon: 'mdi-plus', onClick: openCreate }"
      :secondary-actions="[{ label: 'Dışa aktar', icon: 'mdi-download', onClick: exportProducts }]"
      :overflow-actions="[{ label: 'Toplu sil', icon: 'mdi-delete-sweep-outline', onClick: bulkDelete, danger: true }]"
    />
-->
<template>
  <header class="ek-page-header">
    <nav v-if="section" class="ek-page-header__breadcrumb" aria-label="Breadcrumb">
      <span class="ek-page-header__breadcrumb-section">{{ section }}</span>
      <v-icon icon="mdi-chevron-right" size="14" aria-hidden="true" />
      <span class="ek-page-header__breadcrumb-current">{{ title }}</span>
    </nav>

    <div class="ek-page-header__row">
      <div class="ek-page-header__titles">
        <h1 class="ek-page-header__title">{{ title }}</h1>
        <p v-if="description" class="ek-page-header__description">{{ description }}</p>
      </div>

      <div v-if="primaryAction || secondaryActions?.length || overflowActions?.length" class="ek-page-header__actions">
        <v-btn
          v-for="action in secondaryActions"
          :key="action.label"
          variant="outlined"
          :prepend-icon="action.icon"
          @click="action.onClick"
        >
          {{ action.label }}
        </v-btn>

        <v-menu v-if="overflowActions?.length">
          <template #activator="{ props: menuProps }">
            <v-btn
              icon="mdi-dots-horizontal"
              variant="text"
              density="comfortable"
              aria-label="Diğer eylemler"
              v-bind="menuProps"
            />
          </template>
          <v-list density="compact">
            <v-list-item
              v-for="action in overflowActions"
              :key="action.label"
              :class="{ 'text-error': action.danger }"
              @click="action.onClick"
            >
              <template #prepend v-if="action.icon">
                <v-icon :icon="action.icon" size="18" />
              </template>
              <v-list-item-title>{{ action.label }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-btn v-if="primaryAction" color="primary" :prepend-icon="primaryAction.icon" @click="primaryAction.onClick">
          {{ primaryAction.label }}
        </v-btn>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
export interface EkPageHeaderAction {
  label: string
  icon?: string
  onClick: () => void
  danger?: boolean
}

defineProps<{
  /** Kayıt defterindeki bölüm adı (tıklanabilir DEĞİL — Karar 2.3). */
  section?: string
  title: string
  description?: string
  primaryAction?: EkPageHeaderAction
  secondaryActions?: EkPageHeaderAction[]
  overflowActions?: EkPageHeaderAction[]
}>()
</script>

<style scoped>
.ek-page-header {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ek-page-header__breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-page-header__breadcrumb-current {
  color: var(--ek-color-content-default);
}

.ek-page-header__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ek-space-4);
  flex-wrap: wrap;
}

.ek-page-header__titles {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-page-header__title {
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: -0.01em;
  color: var(--ek-color-content-strong);
  margin: 0;
}

.ek-page-header__description {
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-muted);
  margin: 0;
}

.ek-page-header__actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  flex: none;
}
</style>
