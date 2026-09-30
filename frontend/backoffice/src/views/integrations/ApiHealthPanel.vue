<template>
  <section class="bo-panel" aria-labelledby="bo-health-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-health-title" class="bo-panel__title">API sağlığı</h2>
        <p class="bo-panel__hint">Dış servis çağrıları, hata oranı ve gecikme. Gecikme değeri kova üst sınırıdır (yaklaşık); ölçüm 30 gün saklanır.</p>
      </div>
      <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
    </header>

    <div class="bo-toolbar">
      <div class="bo-seg" role="radiogroup" aria-label="Zaman aralığı">
        <button v-for="o in RANGES" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="range === o.value" :data-range="o.value" @click="range = o.value">{{ o.label }}</button>
      </div>
      <v-select v-model="code" :items="codeItems" item-title="title" item-value="value" label="Entegrasyon" density="compact" hide-details class="bo-toolbar__field" />
    </div>

    <StateBlock
      :phase="phase"
      :error="res.error.value"
      skeleton="cards"
      :rows="3"
      empty-title="Bu aralıkta dış çağrı yok"
      empty-message="Seçili aralıkta kayda geçen entegrasyon çağrısı bulunmuyor. Aralığı genişletin ya da entegrasyon filtresini kaldırın."
      @retry="res.load()"
    >
      <div v-if="res.data.value" class="bo-stack">
        <div class="bo-health__kpis">
          <EkMetricCard label="Toplam çağrı" :value="formatCount(totals.total)" icon="mdi-swap-horizontal" tone="info" />
          <EkMetricCard label="Hatalı çağrı" :value="formatCount(totals.errors)" icon="mdi-alert-circle-outline" :tone="totals.errors ? 'warning' : 'success'" />
          <EkMetricCard label="Genel hata oranı" :value="formatPercent(totals.rate)" :description="totals.total ? 'hata ÷ toplam çağrı' : 'çağrı yok'" icon="mdi-percent-outline" :tone="kpiTone" />
          <EkMetricCard label="Hata alan entegrasyon" :value="`${totals.failing} / ${res.data.value.items.length}`" icon="mdi-transit-connection-variant" :tone="totals.failing ? 'warning' : 'success'" />
        </div>

        <EkCard flush>
          <EkDataTable :items="rows" :columns="COLUMNS" row-key="integrationCode">
            <template #cell-integrationCode="{ item }">
              <EkChannelDot :code="String(item.integrationCode)" :name="CHANNEL[String(item.integrationCode)] ?? String(item.integrationCode)" variant="plain" />
            </template>
            <template #cell-total="{ item }"><span class="ek-num">{{ formatCount(item.total as number) }}</span></template>
            <template #cell-errors="{ item }"><span class="ek-num">{{ formatCount(item.errors as number) }}</span></template>
            <template #cell-errorRate="{ item }">
              <EkStatusChip v-if="item.errorRate !== null" :tone="rateTone(item.errorRate as number)" :label="formatPercent(item.errorRate as number)" dot />
              <span v-else class="bo-muted">—</span>
            </template>
            <template #cell-errorsByCode="{ item }">
              <MeterList v-if="(item as unknown as ApiHealthItem).errorsByCode.length" :label="`${item.integrationCode} hata kodu dağılımı`" :rows="meter(item as unknown as ApiHealthItem)" class="bo-health__meter" />
              <span v-else class="bo-muted">Hata yok</span>
            </template>
            <template #cell-p95Ms="{ item }">
              <span class="bo-health__p95"><span class="ek-num">{{ formatApproxMs(item.p95Ms as number | null) }}</span><span class="bo-approx" title="Kova üst sınırı; gerçek değer değildir">yaklaşık</span></span>
            </template>
            <template #cell-affectedTenants="{ item }">
              <span class="ek-num">{{ formatCount(item.affectedTenants as number) }}</span>
            </template>
          </EkDataTable>
        </EkCard>
        <p class="bo-panel__hint">Etkilenen müşteri, seçili aralıkta bu entegrasyonda en az bir hata alan müşteri sayısıdır; kimlik gösterilmez.</p>
      </div>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkCard, EkChannelDot, EkDataTable, EkMetricCard, EkRefreshButton, EkStatusChip, type EkTableColumn, type StatusTone } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { ApiHealthItem, ApiHealthRange } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import { CHANNEL } from '@bo/utils/labels'
import { formatApproxMs, formatCount, formatPercent } from '@bo/utils/units'
import '@bo/styles/kit.css'

const RANGES: Array<{ value: ApiHealthRange; label: string }> = [
  { value: '1h', label: 'Son 1 saat' },
  { value: '24h', label: 'Son 24 saat' },
  { value: '7d', label: 'Son 7 gün' },
]
const COLUMNS: EkTableColumn[] = [
  { key: 'integrationCode', label: 'Entegrasyon' },
  { key: 'total', label: 'Çağrı', align: 'end' },
  { key: 'errors', label: 'Hata', align: 'end' },
  { key: 'errorRate', label: 'Hata oranı' },
  { key: 'errorsByCode', label: 'Hata kodu dağılımı' },
  { key: 'p95Ms', label: 'p95 gecikme' },
  { key: 'affectedTenants', label: 'Etkilenen müşteri', align: 'end' },
]

const range = ref<ApiHealthRange>('24h')
const code = ref<string>('')
const codeItems = [{ title: 'Tüm entegrasyonlar', value: '' }, ...Object.entries(CHANNEL).map(([value, title]) => ({ title, value }))]

const res = useResource(() => api.call('BackofficeIntegrationService/getApiHealth', { range: range.value, ...(code.value ? { integrationCode: code.value } : {}) }))
watch([range, code], () => res.load(), { immediate: true })

const phase = computed(() => (res.phase.value === 'ready' && !res.data.value?.items.length ? 'empty' : res.phase.value))
const rows = computed(() => (res.data.value?.items ?? []) as unknown as Array<Record<string, unknown>>)
const totals = computed(() => {
  const items = res.data.value?.items ?? []
  const total = items.reduce((s, i) => s + i.total, 0)
  const errors = items.reduce((s, i) => s + i.errors, 0)
  return { total, errors, rate: total ? errors / total : null, failing: items.filter((i) => i.errors > 0).length }
})

const kpiTone = computed(() => {
  const t = rateTone(totals.value.rate)
  return t === 'danger' ? 'error' : t === 'info' ? 'info' : t
})
function rateTone(r: number | null): StatusTone {
  if (r === null) return 'neutral'
  return r >= 0.05 ? 'danger' : r >= 0.01 ? 'warning' : 'success'
}
function meter(i: ApiHealthItem): MeterRow[] {
  return i.errorsByCode.map((e) => ({ key: e.code, label: e.code, value: e.count, display: `${formatCount(e.count)} · ${formatPercent(e.rate)}`, tone: 'danger' }))
}
</script>

<style scoped>
.bo-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
.bo-health__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ek-space-4);
}
.bo-health__meter {
  min-width: 240px;
  padding-block: var(--ek-space-2);
}
.bo-health__p95 {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  white-space: nowrap;
}
</style>
