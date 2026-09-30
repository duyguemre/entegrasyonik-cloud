<template>
  <EkCard title="Olaylar" subtitle="En yeni 50 faturalama olayı. Yönetim kaynaklı değişiklikler 'yönetim' olarak görünür." icon="mdi-history" flush>
    <EkEmptyState v-if="!events.length" variant="no-data" title="Olay yok" message="Bu abonelik için henüz faturalama olayı kaydedilmemiş." />
    <EkDataTable v-else :items="rows" :columns="COLUMNS" row-key="id">
      <template #cell-at="{ item }">
        <span class="bo-cell-stack"><span class="ek-num">{{ formatDateTime((item as Ev).at) }}</span><span>{{ formatRelative((item as Ev).at) }}</span></span>
      </template>
      <template #cell-provider="{ item }">{{ (item as Ev).provider === 'system' ? 'yönetim' : (item as Ev).provider }}</template>
      <template #cell-type="{ item }"><code class="bo-code">{{ (item as Ev).type }}</code></template>
      <template #cell-status="{ item }">{{ (item as Ev).status }}</template>
      <template #cell-failureReason="{ item }">
        <span v-if="(item as Ev).failureReason">{{ (item as Ev).failureReason }}</span>
        <span v-else class="bo-muted">—</span>
      </template>
      <template #cell-payload="{ item }">
        <ul v-if="pairs((item as Ev).payload).length" class="bo-ev__kv">
          <li v-for="[k, v] in pairs((item as Ev).payload)" :key="k"><span class="bo-muted">{{ k }}</span>=<span>{{ v }}</span></li>
        </ul>
        <span v-else class="bo-muted">—</span>
      </template>
    </EkDataTable>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkCard, EkDataTable, EkEmptyState, type EkTableColumn } from '@entegrasyonik/ui/components'
import type { BillingEventRow } from '@bo/api/contract'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import '@bo/styles/kit.css'

type Ev = BillingEventRow
const props = defineProps<{ events: BillingEventRow[] }>()
const rows = computed(() => props.events as unknown as Array<Record<string, unknown>>)

const COLUMNS: EkTableColumn[] = [
  { key: 'at', label: 'Zaman' },
  { key: 'provider', label: 'Kaynak' },
  { key: 'type', label: 'Tür' },
  { key: 'status', label: 'Durum' },
  { key: 'failureReason', label: 'Hata nedeni' },
  { key: 'payload', label: 'Ayrıntı' },
]

function show(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 60 ? `${s.slice(0, 57)}…` : s
  }
  return String(v)
}
function pairs(p: Record<string, unknown> | null): Array<[string, string]> {
  return p ? Object.entries(p).map(([k, v]) => [k, show(v)]) : []
}
</script>

<style scoped>
.bo-ev__kv {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
  overflow-wrap: anywhere;
}
</style>
