<!--
  frontend/src/components/ds/EkPagination.vue

  ADR-0015 Karar 3.2/6.1 — sayfalama, TEK KAYNAK. "Toplam 128 · 1–25" +
  sayfa başına seçici + önceki/sonraki. Devre dışı düğmelerde `aria-label`
  bulunur (T4h'nin kapsam dışı bıraktığı axe ihlali burada kapanır).

  Kullanım:
    <EkPagination v-model:page="page" v-model:page-size="pageSize" :total="totalRecords" />
-->
<template>
  <div class="ek-pagination">
    <span class="ek-pagination__summary ek-num">
      Toplam {{ total }} · {{ rangeStart }}–{{ rangeEnd }}
    </span>

    <v-select
      :model-value="pageSize"
      :items="pageSizeOptions"
      label="Sayfa başına"
      density="compact"
      hide-details
      class="ek-pagination__page-size"
      @update:model-value="(value) => emit('update:pageSize', value)"
    />

    <div class="ek-pagination__nav">
      <v-btn
        icon="mdi-chevron-left"
        variant="text"
        density="comfortable"
        :disabled="page <= 1"
        :aria-label="page <= 1 ? 'Önceki sayfa yok' : 'Önceki sayfa'"
        @click="emit('update:page', page - 1)"
      />
      <span class="ek-pagination__page ek-num">{{ page }} / {{ totalPages }}</span>
      <v-btn
        icon="mdi-chevron-right"
        variant="text"
        density="comfortable"
        :disabled="page >= totalPages"
        :aria-label="page >= totalPages ? 'Sonraki sayfa yok' : 'Sonraki sayfa'"
        @click="emit('update:page', page + 1)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    pageSizeOptions?: number[]
  }>(),
  {
    pageSizeOptions: () => [10, 25, 50, 100],
  },
)

const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))))
const rangeStart = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const rangeEnd = computed(() => Math.min(props.total, props.page * props.pageSize))
</script>

<style scoped>
.ek-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-4);
  flex-wrap: wrap;
  padding: var(--ek-space-2) 0;
}

.ek-pagination__summary {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.ek-pagination__page-size {
  max-width: 140px;
}

.ek-pagination__nav {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-pagination__page {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
  min-width: 48px;
  text-align: center;
}
</style>
