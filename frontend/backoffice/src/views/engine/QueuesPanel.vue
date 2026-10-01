<template>
  <section class="bo-panel" aria-labelledby="bo-queues-title">
    <header class="bo-panel__bar">
      <h2 id="bo-queues-title" class="bo-panel__title">Kuyruk durumu</h2>
      <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
    </header>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="2" empty-title="Kuyruk yok" @retry="res.load()">
      <div class="bo-queues">
        <EkCard v-for="q in res.data.value?.queues ?? []" :key="q.name" :title="q.name" subtitle="BullMQ · sipariş hattı" icon="mdi-tray-full" :icon-tone="q.available ? 'info' : 'warning'">
          <template #actions>
            <EkStatusChip :tone="q.available ? 'success' : 'warning'" :label="q.available ? 'Redis hazır' : 'Redis hazır değil'" dot />
          </template>

          <EkAlert
            v-if="!q.available"
            tone="warning"
            title="Sayaçlar okunamıyor"
            text="Redis hazır değil; kuyruk sayaçları ve başarısız iş listesi geçici olarak kullanılamıyor. Metrik serisi ve ölü mektup sayısı Mongo'dan okunmaya devam eder."
          />
          <div v-else class="bo-queues__kpis">
            <EkMetricCard label="Bekleyen" :value="formatCount(q.counts!.wait + q.counts!.delayed)" :description="`${formatCount(q.counts!.delayed)} gecikmeli`" icon="mdi-timer-sand" tone="info" />
            <EkMetricCard label="İşleniyor" :value="formatCount(q.counts!.active)" :description="q.counts!.paused ? `${q.counts!.paused} duraklatılmış` : 'duraklatılmış yok'" icon="mdi-cog-play-outline" tone="neutral" />
            <EkMetricCard
              label="Başarısız"
              :value="formatCount(q.counts!.failed)"
              description="Son 500 ile sınırlı"
              icon="mdi-alert-circle-outline"
              :tone="q.counts!.failed ? 'error' : 'success'"
            />
            <EkMetricCard label="Ölü mektup (inceleme)" :value="q.dlq.pendingReview === null ? '—' : formatCount(q.dlq.pendingReview)" description="Elle inceleme bekliyor" icon="mdi-email-alert-outline" :tone="q.dlq.pendingReview ? 'warning' : 'success'" />
          </div>
          <div v-if="q.available && q.counts!.failed" class="bo-queues__cta">
            <EkButton tone="secondary" size="sm" icon="mdi-arrow-right" @click="emit('open-failed')">Başarısız işleri incele</EkButton>
          </div>

          <div class="bo-queues__chart">
            <div class="bo-queues__chart-head">
              <h3>Son 24 saat · saatlik</h3>
              <p class="bo-muted">
                En yüksek bekleme p95 <strong class="ek-num">{{ formatApproxMs(peak(q.metrics.series, 'waitMsP95Max'), '—') }}</strong> · işlem p95
                <strong class="ek-num">{{ formatApproxMs(peak(q.metrics.series, 'procMsP95Max'), '—') }}</strong>
              </p>
            </div>
            <template v-if="hasMetrics(q.metrics.series)">
            <SeriesBars
              :points="toPoints(q.metrics.series)"
              :series="SERIES"
              :label="`${q.name} saatlik iş sayısı`"
            />
            <p class="bo-queues__note">p95 değerleri saat içindeki dakikalık p95'lerin en büyüğüdür (gerçek saatlik p95 değildir).</p>
            </template>
            <p v-else class="bo-queues__nometric">
              <v-icon icon="mdi-chart-line-variant" aria-hidden="true" />
              Bu aralıkta ölçüm yok. Kuyruk metrik toplayıcısı sipariş kuyruğu olaylarına bağlı değilse seri sıfır kalır.
            </p>
          </div>
        </EkCard>
      </div>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { EkAlert, EkButton, EkCard, EkMetricCard, EkRefreshButton, EkStatusChip } from '@entegrasyonik/ui/components'
import '@bo/styles/kit.css'
import { api } from '@bo/api'
import type { GetQueuesResponse, QueueSeriesPoint } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import SeriesBars, { type SeriesDef } from '@bo/components/kit/SeriesBars.vue'
import { formatApproxMs, formatCount } from '@bo/utils/units'

const emit = defineEmits<{ counts: [failed: number | null]; 'open-failed': [] }>()
const res = useResource<GetQueuesResponse>(() => api.call('BackofficeEngineService/getQueues', {}))
const SERIES: SeriesDef[] = [
  { key: 'ok', label: 'Başarılı', tone: 'action' },
  { key: 'failed', label: 'Başarısız', tone: 'error' },
]

const toPoints = (s: QueueSeriesPoint[]) => s.map((p) => ({ t: p.t, values: { ok: Math.max(0, p.count - p.failed), failed: p.failed } }))
const hasMetrics = (s: QueueSeriesPoint[]) => s.some((p) => p.count > 0)
const peak = (s: QueueSeriesPoint[], k: 'waitMsP95Max' | 'procMsP95Max') => {
  const vals = s.map((p) => p[k]).filter((v): v is number => v !== null)
  return vals.length ? Math.max(...vals) : null
}

watch(
  () => res.data.value,
  (d) => emit('counts', d ? d.queues.reduce<number | null>((s, q) => (q.counts ? (s ?? 0) + q.counts.failed : s), null) : null),
)
onMounted(() => res.load())
</script>

<style scoped>
.bo-queues {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.bo-queues__kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ek-space-3);
}
.bo-queues__chart {
  margin-top: var(--ek-space-4);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}
.bo-queues__chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-2);
}
.bo-queues__chart-head h3 {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
}
.bo-queues__chart-head p {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
.bo-queues__cta {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--ek-space-3);
}
.bo-queues__note {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-queues__nometric {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-4);
  border: 1px dashed var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}
@media (max-width: 1023px) {
  .bo-queues__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
