<!--
  frontend/src/components/ds/EkDataGrid.vue

  DS-v2 — TEK liste tablosu standardı (sipariş, ürün, iade, log … hepsi).
    - Başlık YAPIŞKAN (yalnızca satırlar kayar); başlık = mikro etiket (11/600
      BÜYÜK HARF), `surface-muted` zemin; sıralanabilir kolonda ok + `aria-sort`
    - Satır: yalnız alt çizgi (`border-subtle`), hover `surface-muted`,
      SEÇİLİ `selection` zemin + solda 3px aksiyon göstergesi
    - Kolon tipleri: id (aksiyon renginde yarı kalın kimlik), num (sağa, tabular),
      muted (ikincil bilgi), text (varsayılan). Hücre içeriği `#cell-<key>` slot'u
    - Durumlar: yükleniyor (iskelet satırlar, başlık korunur), boş (ikon
      kapsülü + başlık + açıklama + #empty-action)
  Yükseklik: kapsayıcısını doldurur (`EkListFrame` içinde kullanılır);
  sayfalama bu bileşenin DIŞINDA, çerçevenin altına sabittir.
-->
<template>
  <div class="ek-grid" :aria-busy="loading || undefined">
    <table class="ek-grid__table" :aria-label="label" :aria-rowcount="loading ? undefined : rows.length + 1">
      <thead>
        <tr>
          <th v-if="selectable" class="ek-grid__th ek-grid__th--select" scope="col">
            <input
              ref="allRef"
              type="checkbox"
              class="ek-grid__check"
              :checked="allSelected"
              :disabled="loading || !rows.length"
              aria-label="Tüm satırları seç"
              @change="toggleAll"
            />
          </th>
          <th
            v-for="col in columns"
            :key="col.key"
            class="ek-grid__th"
            :class="[`ek-grid__th--${col.align ?? alignFor(col)}`, { 'is-sorted': sort?.key === col.key }]"
            scope="col"
            :aria-sort="col.sortable ? ariaSort(col.key) : undefined"
            v-bind="col.width ? { width: col.width } : {}"
          >
            <button v-if="col.sortable" type="button" class="ek-grid__sort" @click="toggleSort(col.key)">
              <span>{{ col.label }}</span>
              <v-icon class="ek-grid__sort-icon" :icon="sortIcon(col.key)" aria-hidden="true" />
            </button>
            <span v-else>{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody v-if="loading">
        <tr v-for="n in skeletonRows" :key="`sk-${n}`" class="ek-grid__row ek-grid__row--skeleton" aria-hidden="true">
          <td v-if="selectable" class="ek-grid__td ek-grid__td--select"><span class="ek-grid__bone ek-grid__bone--box"></span></td>
          <td v-for="(col, ci) in columns" :key="col.key" class="ek-grid__td">
            <span class="ek-grid__bone" :class="`ek-grid__bone--w${(n + ci) % 3}`"></span>
          </td>
        </tr>
      </tbody>
      <tbody v-else-if="rows.length">
        <tr
          v-for="(row, ri) in rows"
          :key="row[rowKey]"
          class="ek-grid__row"
          :class="{ 'is-selected': isSelected(row), 'is-hover': forceHoverIndex === ri }"
          @click="emit('row-click', row)"
        >
          <td v-if="selectable" class="ek-grid__td ek-grid__td--select" @click.stop>
            <input
              type="checkbox"
              class="ek-grid__check"
              :checked="isSelected(row)"
              :aria-label="`${row[labelKey] ?? row[rowKey]} satırını seç`"
              @change="toggleRow(row)"
            />
          </td>
          <td
            v-for="col in columns"
            :key="col.key"
            class="ek-grid__td"
            :class="[`ek-grid__td--${col.type ?? 'text'}`, `ek-grid__td--${col.align ?? alignFor(col)}`]"
          >
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">{{ row[col.key] ?? '—' }}</slot>
          </td>
        </tr>
      </tbody>
      <tbody v-else>
        <tr>
          <td class="ek-grid__empty-cell" :colspan="columns.length + (selectable ? 1 : 0)">
            <div class="ek-grid__empty" role="status">
              <EkIconTile :icon="emptyIcon" tone="neutral" size="lg" />
              <p class="ek-grid__empty-title">{{ emptyTitle }}</p>
              <p class="ek-grid__empty-text">{{ emptyText }}</p>
              <slot name="empty-action" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import EkIconTile from './EkIconTile.vue'

export interface EkGridColumn {
  key: string
  label: string
  type?: 'id' | 'text' | 'num' | 'muted'
  align?: 'start' | 'end' | 'center'
  sortable?: boolean
  width?: string
}

export type EkGridSort = { key: string; dir: 'asc' | 'desc' } | null
type Row = Record<string, any>

const props = withDefaults(
  defineProps<{
    columns: EkGridColumn[]
    rows: Row[]
    label: string
    rowKey?: string
    labelKey?: string
    selectable?: boolean
    selected?: Array<string | number>
    sort?: EkGridSort
    loading?: boolean
    skeletonRows?: number
    emptyTitle?: string
    emptyText?: string
    emptyIcon?: string
    forceHoverIndex?: number
  }>(),
  {
    rowKey: 'id',
    labelKey: 'id',
    selectable: false,
    selected: () => [],
    sort: null,
    loading: false,
    skeletonRows: 8,
    emptyTitle: 'Kayıt bulunamadı',
    emptyText: 'Filtreleri değiştirip yeniden sorgulayın.',
    emptyIcon: 'mdi-text-box-search-outline',
  },
)

const emit = defineEmits<{
  'update:selected': [keys: Array<string | number>]
  'update:sort': [sort: EkGridSort]
  'row-click': [row: Row]
}>()

const allRef = ref<HTMLInputElement | null>(null)
const selectedSet = computed(() => new Set(props.selected))
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((r) => selectedSet.value.has(r[props.rowKey])))
const someSelected = computed(() => props.rows.some((r) => selectedSet.value.has(r[props.rowKey])))

watchEffect(() => {
  if (allRef.value) allRef.value.indeterminate = someSelected.value && !allSelected.value
})

const alignFor = (col: EkGridColumn) => (col.type === 'num' ? 'end' : 'start')
const isSelected = (row: Row) => selectedSet.value.has(row[props.rowKey])

function toggleRow(row: Row) {
  const key = row[props.rowKey]
  const next = new Set(props.selected)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  emit('update:selected', [...next])
}

function toggleAll() {
  emit('update:selected', allSelected.value ? [] : props.rows.map((r) => r[props.rowKey]))
}

function ariaSort(key: string) {
  if (props.sort?.key !== key) return 'none'
  return props.sort.dir === 'asc' ? 'ascending' : 'descending'
}

function sortIcon(key: string) {
  if (props.sort?.key !== key) return 'mdi-swap-vertical'
  return props.sort.dir === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down'
}

function toggleSort(key: string) {
  if (props.sort?.key !== key) return emit('update:sort', { key, dir: 'asc' })
  if (props.sort.dir === 'asc') return emit('update:sort', { key, dir: 'desc' })
  emit('update:sort', null)
}
</script>

<style scoped>
.ek-grid {
  container-type: inline-size;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: auto;
  background: var(--ek-color-surface);
  scrollbar-width: thin;
}

.ek-grid__table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
}

.ek-grid__th {
  position: sticky;
  top: 0;
  z-index: var(--ek-z-sticky);
  height: 40px;
  padding: 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}

.ek-grid__th--end {
  text-align: right;
}

.ek-grid__th--center {
  text-align: center;
}

.ek-grid__th.is-sorted {
  color: var(--ek-color-action-emphasis);
}

.ek-grid__th--select,
.ek-grid__td--select {
  width: 44px;
  padding: 0 0 0 var(--ek-space-4);
}

.ek-grid__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0 calc(var(--ek-space-1) * -1);
  padding: var(--ek-space-1);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.ek-grid__th--end .ek-grid__sort {
  flex-direction: row-reverse;
}

.ek-grid__sort:hover {
  color: var(--ek-color-content-strong);
}

.ek-grid__sort:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-grid__sort-icon {
  font-size: var(--ek-icon-xs);
  opacity: 0.55;
}

.ek-grid__th.is-sorted .ek-grid__sort-icon {
  opacity: 1;
}

.ek-grid__td {
  height: var(--ek-app-row-h, 44px);
  padding: 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  white-space: nowrap;
  transition: var(--ek-transition-colors);
}

.ek-grid__td--end {
  text-align: right;
}

.ek-grid__td--center {
  text-align: center;
}

.ek-grid__td--num {
  font-variant-numeric: tabular-nums;
  color: var(--ek-color-content-strong);
}

.ek-grid__td--id {
  color: var(--ek-color-action);
  font-weight: var(--ek-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.ek-grid__td--muted {
  color: var(--ek-color-content-muted);
}

.ek-grid__row:not(.ek-grid__row--skeleton):hover > .ek-grid__td,
.ek-grid__row.is-hover > .ek-grid__td {
  background: var(--ek-color-surface-muted);
}

.ek-grid__row.is-selected > .ek-grid__td {
  background: var(--ek-color-selection);
}

.ek-grid__row.is-selected > .ek-grid__td:first-child {
  box-shadow: inset 3px 0 0 var(--ek-color-action);
}

.ek-grid__check {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--ek-color-action);
  cursor: pointer;
}

.ek-grid__check:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.ek-grid__bone {
  display: block;
  height: 10px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ek-grid__bone--w0 {
  width: 72%;
}

.ek-grid__bone--w1 {
  width: 48%;
}

.ek-grid__bone--w2 {
  width: 88%;
}

.ek-grid__bone--box {
  width: 16px;
  height: 16px;
}

.ek-grid__empty-cell {
  padding: 0;
  border: 0;
}

.ek-grid__empty {
  /* Tablo yatay kaysa da boş durum görünür alanda ortalı kalır. */
  position: sticky;
  left: 0;
  box-sizing: border-box;
  width: 100cqi;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-12) var(--ek-space-6);
  text-align: center;
}

.ek-grid__empty-title {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-grid__empty-text {
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  white-space: normal;
}
</style>
