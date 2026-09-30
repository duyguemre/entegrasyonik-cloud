<template>
  <section class="bo-panel" aria-labelledby="bo-slow-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-slow-title" class="bo-panel__title">Yavaş sorgular</h2>
        <p class="bo-panel__hint">Uygulama tarafında ölçülen, eşiği aşan sorgular. Sorgu değeri ve filtre kaydedilmez; yalnız veritabanı türü, koleksiyon ve işlem görünür.</p>
      </div>
      <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
    </header>

    <div class="bo-toolbar">
      <div class="bo-seg" role="radiogroup" aria-label="Zaman aralığı">
        <button v-for="o in RANGES" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="range === o.value" :data-range="o.value" @click="range = o.value">{{ o.label }}</button>
      </div>
      <span v-if="res.data.value" class="bo-muted">Eşik: <strong class="ek-num">{{ res.data.value.thresholdMs }} ms</strong> üzeri</span>
    </div>

    <StateBlock
      :phase="phase"
      :error="res.error.value"
      error-title="Yavaş sorgu verisi okunamadı"
      empty-title="Yavaş sorgu yok"
      :empty-message="`Seçili aralıkta ${res.data.value?.thresholdMs ?? 200} ms eşiğini aşan sorgu kaydı yok ya da ölçüm henüz veri yazmadı.`"
      @retry="res.load()"
    >
      <EkCard v-if="res.data.value" flush>
        <EkDataTable tabindex="0" :items="rows" :columns="COLUMNS" row-key="k">
          <template #cell-db="{ item }"><EkStatusChip tone="neutral" :label="item.db === 'app' ? 'Uygulama' : 'Müşteri'" /></template>
          <template #cell-collection="{ item }"><code class="bo-code">{{ item.collection }}</code></template>
          <template #cell-op="{ item }"><code class="bo-code">{{ item.op }}</code></template>
          <template #cell-count="{ item }"><span class="ek-num">{{ formatCount(item.count as number) }}</span></template>
          <template #cell-p95Ms="{ item }">
            <span class="bo-slow__p95"><span class="ek-num">{{ formatApproxMs(item.p95Ms as number | null, '> 60 sn') }}</span><span class="bo-approx" title="Kova üst sınırı; gerçek değer değildir">yaklaşık</span></span>
          </template>
        </EkDataTable>
      </EkCard>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkCard, EkDataTable, EkRefreshButton, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { SlowQueryRange } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { formatApproxMs, formatCount } from '@bo/utils/units'
import '@bo/styles/kit.css'

const RANGES: Array<{ value: SlowQueryRange; label: string }> = [
  { value: '1h', label: '1 saat' },
  { value: '24h', label: '24 saat' },
  { value: '7d', label: '7 gün' },
  { value: '30d', label: '30 gün' },
]
const COLUMNS: EkTableColumn[] = [
  { key: 'db', label: 'Veritabanı' },
  { key: 'collection', label: 'Koleksiyon' },
  { key: 'op', label: 'İşlem' },
  { key: 'count', label: 'Yavaş çağrı', align: 'end' },
  { key: 'p95Ms', label: 'p95 süre' },
]
const range = ref<SlowQueryRange>('24h')
const res = useResource(() => api.call('BackofficeInfraService/getSlowQueries', { range: range.value }))
watch(range, () => res.load(), { immediate: true })

// Seçim (aralık/filtre) değişip okuma başarısız olursa eski seçimin verisini göstermeyiz.
const phase = computed(() => (res.stale.value ? (res.error.value?.kind === 'unavailable' ? 'degraded' : 'error') : res.phase.value === 'ready' && !res.data.value?.items.length ? 'empty' : res.phase.value))
const rows = computed(() => (res.data.value?.items ?? []).map((i) => ({ ...i, k: `${i.db}/${i.collection}/${i.op}` })) as unknown as Array<Record<string, unknown>>)
</script>

<style scoped>
.bo-slow__p95 {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  white-space: nowrap;
}
</style>
