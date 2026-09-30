<!--
  frontend/src/components/ds/EkFilterBar.vue

  ADR-0015 Karar 2.3/6.1 — filtre çubuğu; `EkPageHeader`'ın ALTINDA,
  içerikten ÖNCE gelir. Arama + (isteğe bağlı slot'lu) ek filtreler + aktif
  filtre çipleri + "Filtreleri temizle" + yenile.

  Kullanım:
    <EkFilterBar
      v-model:search="searchTerm"
      search-placeholder="Sipariş No, Müşteri Adı veya Telefon Ara"
      :active-filters="[{ key: 'status', label: 'Durum: Onaylandı' }]"
      :loading="isRefreshing"
      @clear="clearFilters"
      @refresh="refetch"
    >
      <template #extra>
        <v-select ... />
      </template>
    </EkFilterBar>
-->
<template>
  <div class="ek-filter-bar">
    <div class="ek-filter-bar__row">
      <v-text-field
        v-if="searchPlaceholder !== undefined"
        :model-value="search"
        :label="searchPlaceholder"
        prepend-inner-icon="mdi-magnify"
        clearable
        class="ek-filter-bar__search"
        @update:model-value="(value) => emit('update:search', value ?? '')"
      />
      <slot name="extra" />
      <v-btn
        icon="mdi-refresh"
        variant="text"
        density="comfortable"
        :loading="loading"
        aria-label="Yenile"
        @click="emit('refresh')"
      />
    </div>

    <div v-if="activeFilters?.length" class="ek-filter-bar__chips">
      <v-chip
        v-for="filter in activeFilters"
        :key="filter.key"
        size="small"
        variant="tonal"
        closable
        @click:close="emit('remove-filter', filter.key)"
      >
        {{ filter.label }}
      </v-chip>
      <v-btn variant="text" size="small" density="compact" @click="emit('clear')">
        Filtreleri temizle
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface EkActiveFilter {
  key: string
  label: string
}

withDefaults(
  defineProps<{
    search?: string
    searchPlaceholder?: string
    activeFilters?: EkActiveFilter[]
    loading?: boolean
  }>(),
  {
    search: '',
    loading: false,
  },
)

const emit = defineEmits<{
  'update:search': [value: string]
  clear: []
  refresh: []
  'remove-filter': [key: string]
}>()
</script>

<style scoped>
.ek-filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ek-filter-bar__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  flex-wrap: wrap;
}

.ek-filter-bar__search {
  max-width: 360px;
  flex: 1 1 240px;
}

.ek-filter-bar__chips {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  flex-wrap: wrap;
}
</style>
