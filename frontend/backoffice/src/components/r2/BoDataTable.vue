<!--
  BoDataTable — STANDART VERİ LİSTESİ (BO2-40). Ortak paketin `EkDataTable`'ı (sütun tipi → hizalama/biçim) üstüne
  backoffice standardı: operasyon yoğunluğu (36 px, `.bo-dense`), dört durum (StateBlock), alt bilgi yuvasında TEK
  sayfalama (`BoPagination`). Ekran tablo kopyası yazmaz; hücre özelleştirmesi `#cell-<key>` yuvalarıyla geçer.

    <BoDataTable :items="rows" :columns="COLUMNS" row-key="id" label="Başarısız işler" :phase="phase" :error="error" @retry="reload">
      <template #cell-code="{ item }"><span class="bo-code-tag">{{ item.code }}</span></template>
      <template #footer><BoPagination … /></template>
    </BoDataTable>
-->
<template>
  <div class="bo-dt" :class="{ 'bo-dense': density === 'compact' }" role="region" :aria-label="label" data-bo-datatable>
    <StateBlock v-if="phase && phase !== 'ready'" :phase="phase" :error="error" skeleton="table" :rows="skeletonRows" :empty-title="emptyTitle" :empty-message="emptyMessage" @retry="emit('retry')" />
    <!-- bo-wdg: kök `.ek-data-table` yatay kaydırma kabıdır → klavyeyle odaklanır bölge (BoTableFrame ile aynı ad deseni).
         Öznitelikler yalnız burada verilir; web uygulamasının EkDataTable'ı değişmez. -->
    <EkDataTable v-else v-bind="$attrs" :items="items" :columns="columns" :row-key="rowKey" tabindex="0" role="region" :aria-label="`${label} tablosu`">
      <template v-for="(_, name) in $slots" #[name]="slotProps"><slot :name="name" v-bind="slotProps ?? {}" /></template>
    </EkDataTable>
    <slot name="footer" />
  </div>
</template>

<script setup lang="ts">
import { EkDataTable, type EkTableColumn } from '@entegrasyonik/ui/components'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import type { DescribedError } from '@bo/utils/errors'

defineOptions({ inheritAttrs: false })
withDefaults(
  defineProps<{
    items: Array<Record<string, unknown>>
    columns: EkTableColumn[]
    rowKey?: string
    label: string
    density?: 'comfortable' | 'compact'
    phase?: 'loading' | 'ready' | 'empty' | 'error' | 'degraded' | 'notFound'
    error?: DescribedError | null
    emptyTitle?: string
    emptyMessage?: string
    skeletonRows?: number
  }>(),
  { rowKey: 'id', density: 'compact', skeletonRows: 5 },
)
const emit = defineEmits<{ retry: [] }>()
</script>

<style scoped>
.bo-dt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* §12.2 tablo rolü (13/20): paket hücresi 14 px (`--ek-font-size-md`) → BoTableFrame ile aynı ölçü. */
.bo-dt :deep(.ek-data-table__td) {
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
}

.bo-dt :deep(.ek-data-table:focus-visible) {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
</style>
