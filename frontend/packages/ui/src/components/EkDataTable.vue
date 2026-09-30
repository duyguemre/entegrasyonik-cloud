<!--
  frontend/src/components/ds/EkDataTable.vue

  ADR-0015 Karar 3.2/6.1 — tablo dili, TEK KAYNAK. Sütun tanımında `type`
  (`text|id|money|number|date|datetime|status|platform|actions`); hizalama,
  biçim (composables/format.ts) ve render TİPTEN GELİR — ekran hücre stili
  YAZMAZ (özel render gerekiyorsa `#cell-<key>` slot'u kullanılır).

  Başlık: `surface-muted` zemin, sm 13/500 muted, sticky. Sütun ayırıcı "│"
  YOK. Satırlar: yalnızca alt kenarlık, zebra YOK. Hover `surface-muted`,
  seçili satır `primary` %6. Satır yüksekliği `--ek-app-row-h`. Satır
  eylemleri: en fazla 1 görünür birincil + `⋯` (nötr hayalet 32px) —
  `#cell-actions` slot'unda sağlanır, düzen bu bileşenin sorumluluğu değildir.

  Kullanım:
    <EkDataTable
      :items="orders"
      :columns="[
        { key: 'orderNumber', label: 'Sipariş No', type: 'id' },
        { key: 'customerName', label: 'Müşteri', type: 'text' },
        { key: 'total', label: 'Tutar', type: 'money' },
        { key: 'createdAt', label: 'Tarih', type: 'datetime' },
        { key: 'status', label: 'Durum', type: 'status' },
        { key: 'actions', label: '', type: 'actions' },
      ]"
    >
      <template #cell-status="{ item }">
        <EkStatusChip :tone="statusEntry(item).tone" :label="$t(statusEntry(item).labelKey)" />
      </template>
      <template #cell-actions="{ item }">
        <v-btn icon="mdi-eye-outline" variant="text" density="comfortable" aria-label="Detay" @click="openDetail(item)" />
      </template>
    </EkDataTable>
-->
<template>
  <!-- Aşama 6b (Standart 2): dar kapta (< 600px, kap sorgusu) satır = KART — ilk kolon başlık, `actions` sağ üstte,
       diğer hücreler "ETİKET değer" satırı (EkDataGrid kart düzeniyle aynı dil). Tablo semantiği korunur. -->
  <div class="ek-data-table">
    <table class="ek-data-table__table">
      <thead class="ek-data-table__head">
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            class="ek-data-table__th"
            :class="alignClass(column)"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="String(item[rowKey])"
          class="ek-data-table__row"
          :class="{ 'ek-data-table__row--selected': selectedKeys?.includes(item[rowKey]) }"
        >
          <td
            v-for="(column, ci) in columns"
            :key="column.key"
            class="ek-data-table__td"
            :class="[alignClass(column), { 'is-lead': ci === 0, 'is-actions': column.type === 'actions' || column.key === 'actions' }]"
            :data-label="column.label || undefined"
          >
            <slot :name="`cell-${column.key}`" :item="item" :column="column">
              <span :class="{ 'ek-num': isNumericType(column.type) }">{{ renderCell(item, column) }}</span>
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../format'

export type EkTableColumnType = 'text' | 'id' | 'money' | 'number' | 'date' | 'datetime' | 'status' | 'platform' | 'actions'

export interface EkTableColumn {
  key: string
  label: string
  type?: EkTableColumnType
  align?: 'start' | 'end'
}

withDefaults(
  defineProps<{
    items: Array<Record<string, any>>
    columns: EkTableColumn[]
    rowKey?: string
    selectedKeys?: Array<string | number>
  }>(),
  {
    rowKey: 'id',
  },
)

const NUMERIC_TYPES: EkTableColumnType[] = ['money', 'number', 'date', 'datetime']

function isNumericType(type?: EkTableColumnType): boolean {
  return !!type && NUMERIC_TYPES.includes(type)
}

function alignClass(column: EkTableColumn): string {
  const align = column.align ?? (isNumericType(column.type) ? 'end' : 'start')
  return `ek-data-table__td--${align}`
}

function renderCell(item: Record<string, any>, column: EkTableColumn): string {
  const value = item[column.key]
  switch (column.type) {
    case 'money':
      return formatMoney(value)
    case 'number':
      return formatNumber(value)
    case 'date':
      return formatDate(value)
    case 'datetime':
      return formatDateTime(value)
    default:
      return value ?? '—'
  }
}
</script>

<style scoped>
.ek-data-table {
  width: 100%;
  overflow-x: auto;
  container-type: inline-size;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-data-table__table {
  width: 100%;
  border-collapse: collapse;
}

.ek-data-table__head {
  position: sticky;
  top: 0;
  background: var(--ek-color-surface-muted);
  z-index: 1;
}

.ek-data-table__th {
  padding: 0 var(--ek-space-4);
  height: var(--ek-app-row-h);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
  text-align: left;
  white-space: nowrap;
}

.ek-data-table__row {
  border-bottom: 1px solid var(--ek-color-border-default);
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-data-table__row:hover {
  background-color: var(--ek-color-surface-muted);
}

.ek-data-table__row--selected {
  background-color: color-mix(in srgb, var(--ek-color-primary) 6%, transparent);
}

.ek-data-table__td {
  padding: 0 var(--ek-space-4);
  height: var(--ek-app-row-h);
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-default);
}

.ek-data-table__td--end,
.ek-data-table__th--end {
  text-align: right;
}

.ek-data-table__row:last-child {
  border-bottom: none;
}

/* ---- Dar kap: satır = kart ---- */
@container (max-width: 599.98px) {
  .ek-data-table__head {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .ek-data-table__table,
  .ek-data-table__table tbody {
    display: block;
  }

  .ek-data-table__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ek-space-1) var(--ek-space-3);
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .ek-data-table__td {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--ek-space-3);
    grid-column: 1 / -1;
    height: auto;
    padding: 0;
    text-align: right;
    font-size: var(--ek-type-table-size);
    line-height: var(--ek-type-table-line);
  }

  .ek-data-table__td[data-label]::before {
    content: attr(data-label);
    flex: none;
    font-size: var(--ek-type-micro-size);
    line-height: var(--ek-type-micro-line);
    font-weight: var(--ek-type-micro-weight);
    letter-spacing: var(--ek-type-micro-tracking);
    text-transform: uppercase;
    color: var(--ek-color-content-muted);
    text-align: left;
  }

  .ek-data-table__td.is-lead {
    grid-column: 1;
    grid-row: 1;
    display: block;
    text-align: left;
    font-weight: var(--ek-font-weight-semibold);
    color: var(--ek-color-content-strong);
    margin-bottom: var(--ek-space-1);
  }

  .ek-data-table__td.is-lead::before,
  .ek-data-table__td.is-actions::before {
    content: none;
  }

  .ek-data-table__td.is-actions {
    grid-column: 2;
    grid-row: 1;
    justify-content: flex-end;
  }
}
</style>
