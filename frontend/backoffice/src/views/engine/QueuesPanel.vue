<template>
  <div class="bo-engine-stack">
    <p class="bo-panel__hint">Kuyruk sağlığı: bekleyen, işlenen ve başarısız iş sayıları, elle inceleme bekleyen ölü mektuplar ve son 24 saatin iş akışı.</p>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="2" empty-title="Kuyruk yok" @retry="res.load()">
      <BoSection
        v-for="q in res.data.value?.queues ?? []"
        :id="`bo-queue-${q.name}`"
        :key="q.name"
        :title="q.name"
        description="BullMQ · sipariş hattı"
        icon="mdi-tray-full"
      >
        <template #actions>
          <EkStatusChip :tone="q.available ? 'success' : 'warning'" :label="q.available ? 'Redis hazır' : 'Redis hazır değil'" dot />
          <EkRefreshButton quiet-success :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" :error="res.stale.value ? res.error.value?.title : null" @refresh="res.load()" />
        </template>

        <EkAlert
          v-if="!q.available"
          tone="warning"
          title="Sayaçlar okunamıyor"
          text="Redis hazır değil; kuyruk sayaçları ve başarısız iş listesi geçici olarak kullanılamıyor. Metrik serisi ve ölü mektup sayısı Mongo'dan okunmaya devam eder."
        />
        <BoTileGrid v-else :min="176" dense>
          <BoStat label="Bekleyen" :value="formatCount(q.counts!.wait + q.counts!.delayed)" :hint="`${formatCount(q.counts!.delayed)} gecikmeli`" tone="info" />
          <BoStat label="İşleniyor" :value="formatCount(q.counts!.active)" :hint="q.counts!.paused ? `${q.counts!.paused} duraklatılmış` : 'duraklatılmış yok'" />
          <BoStat label="Başarısız" :value="formatCount(q.counts!.failed)" hint="Son 500 ile sınırlı" :tone="q.counts!.failed ? 'critical' : 'success'" />
          <BoStat label="Ölü mektup" :value="q.dlq.pendingReview === null ? '—' : formatCount(q.dlq.pendingReview)" hint="Elle inceleme bekliyor" :tone="q.dlq.pendingReview ? 'warning' : 'success'" />
        </BoTileGrid>

        <BoSection plain :heading-level="3" title="Son 24 saat · saatlik" :description="`En yüksek bekleme p95 ${formatApproxMs(peak(q.metrics.series, 'waitMsP95Max'), '—')} · işlem p95 ${formatApproxMs(peak(q.metrics.series, 'procMsP95Max'), '—')}`">
          <template v-if="hasMetrics(q.metrics.series)">
            <SeriesBars :points="toPoints(q.metrics.series)" :series="SERIES" :label="`${q.name} saatlik iş sayısı`" />
            <p class="bo-queues__note">p95 değerleri saat içindeki dakikalık p95'lerin en büyüğüdür (gerçek saatlik p95 değildir).</p>
          </template>
          <p v-else class="bo-queues__nometric">
            <v-icon icon="mdi-chart-line-variant" aria-hidden="true" />
            Bu aralıkta ölçüm yok. Kuyruk metrik toplayıcısı sipariş kuyruğu olaylarına bağlı değilse seri sıfır kalır.
          </p>
        </BoSection>

        <template v-if="q.available && q.counts!.failed" #footer>
          <div class="bo-queues__cta"><BoAction kind="detail" size="sm" @click="emit('open-failed')">Başarısız işleri incele</BoAction></div>
        </template>
      </BoSection>
    </StateBlock>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { EkAlert, EkRefreshButton, EkStatusChip } from '@entegrasyonik/ui/components'
import '@bo/styles/kit.css'
import { api } from '@bo/api'
import type { GetQueuesResponse, QueueSeriesPoint } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
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
.bo-engine-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
.bo-queues__cta {
  display: flex;
  justify-content: flex-end;
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

/* BO-LOCAL-01 — "ölçüm yok" notu: kutu köşeli, sakin zeminde kesik çerçeveli boş durum. */
.bo-queues__nometric {
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
}
</style>
