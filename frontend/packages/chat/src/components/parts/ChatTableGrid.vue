<!--
  Gerçek <table>: <caption> (başlık + kayıt sayısı), scope="col"; yatay taşmada kaydırma kabı odaklanabilir + etiketli.
  `untrusted` sütunlar düz metin, 2 satır kırpma, tam metin `title`'da. Satırlar `tabindex=-1` (daha fazla → ilk yeni satıra odak).
-->
<template>
  <div ref="scrollRef" class="ek-chat-grid" tabindex="0" role="region" :aria-label="regionLabel">
    <table class="ek-chat-grid__table">
      <caption class="ek-chat-sr-only">{{ caption }}</caption>
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key" scope="col" :class="`is-${columnAlign(col)}`">{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="rowId(row, index)" :ref="(el) => setRow(el, index)" tabindex="-1">
          <td v-for="col in columns" :key="col.key" :class="`is-${columnAlign(col)}`">
            <template v-if="isEntityRef(row[col.key])">
              <a v-if="entityTarget(row[col.key])" class="ek-chat-link" :href="entityTarget(row[col.key])!.href" @click.prevent="openEntity(row[col.key])">{{ (row[col.key] as EntityRef).label }}</a>
              <span v-else>{{ (row[col.key] as EntityRef).label }}</span>
            </template>
            <EkStatusChip v-else-if="col.type === 'status' && row[col.key] != null" v-bind="statusOf(col, row[col.key])" />
            <EkChannelDot v-else-if="col.type === 'channel' && row[col.key]" :code="String(row[col.key])" show-name variant="plain" />
            <span v-else-if="col.untrusted" class="ek-chat-grid__clamp" :title="text(row[col.key], col)">{{ text(row[col.key], col) }}</span>
            <template v-else>{{ text(row[col.key], col) }}</template>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length" class="ek-chat-grid__empty">{{ t('table.empty') }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkChannelDot, EkStatusChip } from '@entegrasyonik/ui/components'
import type { CellValue, EntityRef, TableColumn, TableRow } from '../../protocol/v1'
import { useChat } from '../../state/useChat'
import { columnAlign, formatCell, isEntityRef } from '../cellFormat'

const props = defineProps<{ columns: TableColumn[]; rows: TableRow[]; rowKey: string; caption: string; regionLabel: string }>()
const chat = useChat()
const { t } = chat
const defaults = computed(() => chat.host.formatDefaults())
const labels = computed(() => ({ yes: t('table.yes'), no: t('table.no') }))
const rowEls: HTMLElement[] = []

function setRow(el: unknown, index: number) {
  if (el instanceof HTMLElement) rowEls[index] = el
}

function rowId(row: TableRow, index: number) {
  const key = row[props.rowKey]
  return isEntityRef(key) ? `${key.type}:${key.id}` : `${String(key ?? '')}:${index}`
}

const text = (value: CellValue, col: TableColumn) => formatCell(value, col, defaults.value, labels.value)

function statusOf(col: TableColumn, value: CellValue) {
  const raw = String(value)
  const mapped = col.statusDomain ? chat.host.status?.(col.statusDomain, raw) : null
  return mapped ?? { tone: 'neutral' as const, label: raw }
}

function entityTarget(value: CellValue) {
  if (!isEntityRef(value)) return null
  const link = chat.host.linkForEntity?.(value)
  return link ? chat.host.resolveLink(link) : null
}

function openEntity(value: CellValue) {
  if (!isEntityRef(value)) return
  chat.host.track?.({ name: 'chat.link', entity: value.type })
  entityTarget(value)?.open()
}

defineExpose({
  focusRow(index: number) {
    rowEls[index]?.focus({ preventScroll: false })
  },
})
</script>
