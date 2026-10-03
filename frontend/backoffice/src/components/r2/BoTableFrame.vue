<!--
  BoTableFrame — ÖZEL SATIRLI tablo kabı (BO2-40). `.bo-table` işaretlemesinin TEK yeri: odaklanabilir kaydırma bölgesi
  (axe scrollable-region-focusable), ekran okuyucu başlığı, yoğunluk, yapışkan başlık. Sütun tanımıyla çizilebilen
  listeler `BoDataTable` kullanır; satır içi zengin hücre (birden çok bağlantı, iz) gerekiyorsa bu kap.

    <BoTableFrame label="Podlar" density="compact">
      <template #head><tr><th scope="col">Pod</th><th scope="col" class="is-num">Kira</th></tr></template>
      <tr v-for="p in pods" :key="p.pod">…</tr>
    </BoTableFrame>
-->
<template>
  <!-- flat: küçük gömülü tablo (teknik ayrıntılar) — bant yok. Değilse STANDART LİSTE: üst bant → tablo → alt bant. -->
  <div v-if="flat" class="bo-table-wrap bo-table-wrap--flat" tabindex="0" role="region" :aria-label="`${label} tablosu`" :style="maxHeight ? { '--bo-table-max-h': maxHeight } : undefined" v-bind="$attrs">
    <table class="bo-table" :data-density="density">
      <caption class="ek-sr-only">{{ label }}</caption>
      <thead><slot name="head" /></thead>
      <tbody><slot /></tbody>
    </table>
  </div>
  <div v-else ref="root" class="bo-tf bo-listframe" data-bo-tableframe>
    <BoTableBar :count="rowCount" :show-count="!ext.count"><slot name="toolbar" /></BoTableBar>
    <div class="bo-table-wrap bo-table-wrap--inner" tabindex="0" role="region" :aria-label="`${label} tablosu`" :style="maxHeight ? { '--bo-table-max-h': maxHeight } : undefined" v-bind="$attrs">
      <table class="bo-table" :data-density="density">
        <caption class="ek-sr-only">{{ label }}</caption>
        <thead><slot name="head" /></thead>
        <tbody ref="body"><slot /></tbody>
      </table>
    </div>
    <slot name="footer">
      <BoPagination v-if="!ext.pager && rowCount" :count="rowCount" />
    </slot>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUpdated, ref } from 'vue'
import BoPagination from './BoPagination.vue'
import BoTableBar from './BoTableBar.vue'
import { useListChrome } from './listChrome'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ label: string; density?: 'comfortable' | 'compact'; flat?: boolean; maxHeight?: string }>(), { density: 'compact' })
const { root, ext } = useListChrome()
/** Satır sayısı DOM'dan (özel satırlı tablo; boş/"sonuç yok" tek hücreli satır sayılmaz). */
const body = ref<HTMLTableSectionElement | null>(null)
const rowCount = ref(0)
const countRows = () => {
  rowCount.value = body.value ? [...body.value.rows].filter((r) => !r.querySelector('td[colspan]:only-child')).length : 0
}
onMounted(countRows)
onUpdated(countRows)
</script>
