<template>
  <BoSection id="bo-health" title="API sağlığı" description="Dış servis çağrıları, hata oranı ve gecikme. Gecikme değeri kova üst sınırıdır (yaklaşık); ölçüm 30 gün saklanır." icon="mdi-heart-pulse">
    <template #actions>
      <EkRefreshButton quiet-success :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
    </template>

    <BoFilterBar label="API sağlığı süzgeçleri" :active="code ? 1 : 0" @clear="code = ''">
      <BoSegmented v-model="range" :options="RANGES" label="Zaman aralığı" />
      <v-select v-model="code" :items="codeItems" item-title="title" item-value="value" label="Entegrasyon" density="compact" hide-details class="bo-toolbar__field" />
    </BoFilterBar>

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
        <BoTileGrid :min="200" dense>
          <BoStat label="Toplam çağrı" :value="formatCount(totals.total)" />
          <BoStat label="Hatalı çağrı" :value="formatCount(totals.errors)" :tone="totals.errors ? 'warning' : 'success'" />
          <BoStat label="Genel hata oranı" :value="formatPercent(totals.rate)" :hint="totals.total ? 'hata ÷ toplam çağrı' : 'çağrı yok'" :tone="kpiTone" />
          <BoStat label="Hata alan entegrasyon" :value="`${totals.failing} / ${res.data.value.items.length}`" :tone="totals.failing ? 'warning' : 'success'" />
        </BoTileGrid>

        <BoDataTable tabindex="0" :items="rows" :columns="COLUMNS" row-key="integrationCode" label="Entegrasyon başına API sağlığı">
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
        </BoDataTable>
      </div>
    </StateBlock>
    <template #footer>
      <span class="bo-health__note">Etkilenen müşteri, seçili aralıkta bu entegrasyonda en az bir hata alan müşteri sayısıdır; kimlik gösterilmez.</span>
    </template>
  </BoSection>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkChannelDot, EkRefreshButton, EkStatusChip, type EkTableColumn, type StatusTone } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { ApiHealthItem, ApiHealthRange } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
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

// Seçim (aralık/filtre) değişip okuma başarısız olursa eski seçimin verisini göstermeyiz.
const phase = computed(() => (res.stale.value ? (res.error.value?.kind === 'unavailable' ? 'degraded' : 'error') : res.phase.value === 'ready' && !res.data.value?.items.length ? 'empty' : res.phase.value))
const rows = computed(() => (res.data.value?.items ?? []) as unknown as Array<Record<string, unknown>>)
const totals = computed(() => {
  const items = res.data.value?.items ?? []
  const total = items.reduce((s, i) => s + i.total, 0)
  const errors = items.reduce((s, i) => s + i.errors, 0)
  return { total, errors, rate: total ? errors / total : null, failing: items.filter((i) => i.errors > 0).length }
})

const kpiTone = computed<'neutral' | 'critical' | 'warning' | 'success'>(() => {
  const t = rateTone(totals.value.rate)
  return t === 'danger' ? 'critical' : t === 'warning' ? 'warning' : t === 'success' ? 'success' : 'neutral'
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
.bo-health__note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.bo-health__meter {
  min-width: 240px;
  padding-block: var(--ek-space-2);
}
/* MOB-06: kart görünümünde dağılım hücresi etiketin altına tam genişlik iner (değer kırpılmaz). */
@media (max-width: 599.98px) {
  .bo-health__meter {
    width: 100%;
    min-width: 0;
  }
  :deep(.ek-data-table__td:has(.bo-health__meter)) {
    flex-direction: column;
    align-items: stretch;
    text-align: left;
  }
}
.bo-health__p95 {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  white-space: nowrap;
}
</style>
