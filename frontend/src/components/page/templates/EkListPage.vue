<!--
  frontend/src/components/page/templates/EkListPage.vue

  ADR-0015 Karar 3.9/6.1 — "Liste sayfası" TEK KAYNAK şablonu (= `EkListDetailTemplate`'in
  liste kısmı; detay için ayrıca `EkDetailSheet` kullanılır — Karar 6.1'de
  ayrı bir satırdır). Sıra SABİTTİR: `EkPageHeader` → `EkFilterBar` → toplu
  eylem çubuğu (seçim varsa) → tablo (slot, `EkDataTable`) → `EkPagination`.
  4 durum slot'u (loading/empty/empty-filtered/error) ZORUNLU ve
  VARSAYILANLIDIR — ekran hiçbirini atlayamaz.

  Kullanım (bir liste ekranının GÖVDESİ):
    <EkListPage
      section="Katalog" title="Ürünler" :description="..."
      :primary-action="{ label: 'Yeni ürün', icon: 'mdi-plus', onClick: openCreate }"
      v-model:search="search" search-placeholder="Ürün adı veya SKU ara"
      :state="state" :selected-count="selected.length"
      @clear-filters="clearFilters" @refresh="refetch"
    >
      <template #batch-actions>
        <span>{{ selected.length }} seçildi</span>
        <v-btn variant="text" @click="bulkDelete">Sil</v-btn>
      </template>
      <EkDataTable :items="products" :columns="columns" />
      <template #pagination>
        <EkPagination v-model:page="page" v-model:page-size="pageSize" :total="total" />
      </template>
    </EkListPage>
-->
<template>
  <div class="ek-list-page">
    <EkPageHeader
      :section="section"
      :title="title"
      :description="description"
      :primary-action="primaryAction"
      :secondary-actions="secondaryActions"
      :overflow-actions="overflowActions"
    />

    <EkFilterBar
      :search="search"
      :search-placeholder="searchPlaceholder"
      :active-filters="activeFilters"
      :loading="state === 'loading'"
      @update:search="(value) => emit('update:search', value)"
      @clear="emit('clear-filters')"
      @refresh="emit('refresh')"
      @remove-filter="(key) => emit('remove-filter', key)"
    >
      <template #extra>
        <slot name="filters-extra" />
      </template>
    </EkFilterBar>

    <div v-if="selectedCount > 0" class="ek-list-page__batch-bar">
      <slot name="batch-actions" />
    </div>

    <div class="ek-list-page__body">
      <slot v-if="state === 'loading'" name="loading">
        <EkSkeleton type="table" />
      </slot>
      <slot v-else-if="state === 'empty'" name="empty">
        <EkEmptyState variant="first-run" title="Henüz kayıt yok" message="İlk kaydınızı oluşturarak başlayın." />
      </slot>
      <slot v-else-if="state === 'empty-filtered'" name="empty-filtered">
        <EkEmptyState variant="no-results" title="Sonuç yok" message="Farklı bir arama veya filtre deneyin." show-action action-text="Filtreleri temizle" action-icon="mdi-filter-remove-outline" @action="emit('clear-filters')" />
      </slot>
      <slot v-else-if="state === 'error'" name="error">
        <EkErrorState message="Kayıtlar yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="emit('refresh')" />
      </slot>
      <slot v-else />
    </div>

    <slot name="pagination" />
  </div>
</template>

<script setup lang="ts">
import EkPageHeader, { type EkPageHeaderAction } from '../EkPageHeader.vue'
import { EkFilterBar, type EkActiveFilter, EkSkeleton, EkEmptyState, EkErrorState } from '@entegrasyonik/ui/components'

withDefaults(
  defineProps<{
    section?: string
    title: string
    description?: string
    primaryAction?: EkPageHeaderAction
    secondaryActions?: EkPageHeaderAction[]
    overflowActions?: EkPageHeaderAction[]
    search?: string
    searchPlaceholder?: string
    activeFilters?: EkActiveFilter[]
    state?: 'ready' | 'loading' | 'empty' | 'empty-filtered' | 'error'
    selectedCount?: number
  }>(),
  {
    search: '',
    state: 'ready',
    selectedCount: 0,
  },
)

const emit = defineEmits<{
  'update:search': [value: string]
  'clear-filters': []
  refresh: []
  'remove-filter': [key: string]
}>()
</script>

<style scoped>
.ek-list-page {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-list-page__batch-bar {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-4);
  background: var(--ek-color-primary);
  color: var(--ek-color-background);
  border-radius: var(--ek-radius-md);
}

.ek-list-page__body {
  min-height: 120px;
}
</style>
