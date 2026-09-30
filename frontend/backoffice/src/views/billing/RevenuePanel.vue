<template>
  <section class="bo-panel" aria-labelledby="bo-rev-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-rev-title" class="bo-panel__title">Gelir metrikleri</h2>
        <p class="bo-panel__hint">Dönem: {{ periodText }}</p>
      </div>
      <div class="bo-toolbar">
        <div class="bo-seg" role="radiogroup" aria-label="Aralık">
          <button v-for="r in RANGES" :key="r" type="button" role="radio" class="bo-seg__opt" :aria-checked="range === r" :data-range="r" @click="range = r">
            {{ r === '7d' ? '7 gün' : r === '30d' ? '30 gün' : '90 gün' }}
          </button>
        </div>
        <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" @refresh="res.load()" />
      </div>
    </header>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" degraded-title="Gelir metrikleri şu an okunamıyor" @retry="res.load()">
      <div v-if="m" class="bo-rev">
        <EkAlert tone="info" title="Liste fiyatından tahmini" text="Tutarlar plan liste fiyatına göre hesaplanır; indirim, kupon ve vergi hesaba katılmaz. Gerçek faturalanan tutar değildir." />

        <div class="bo-grid-3">
          <EkMetricCard label="Aylık yinelenen gelir (MRR)" :value="mrrText" description="liste fiyatından tahmini" icon="mdi-cash-multiple" data-testid="mrr" />
          <EkMetricCard label="Faturalanan abonelik" :value="formatCount(m.mrr.billedSubscriptions)" description="aktif ve ödeme gecikmiş, fiyatlı" icon="mdi-receipt-text-outline" />
          <EkMetricCard label="Teklif bazlı abonelik" :value="formatCount(m.mrr.quoteBasedSubscriptions)" description="özel teklif; MRR'a girmez" icon="mdi-handshake-outline" />
        </div>
        <p v-if="m.mrr.unpricedSubscriptions" class="bo-muted">
          {{ formatCount(m.mrr.unpricedSubscriptions) }} abonelik için plan kaydı bulunamadı (fiyatsız); MRR'a dahil edilmedi.
        </p>

        <div class="bo-grid-2">
          <EkCard title="Plan başına MRR" subtitle="liste fiyatından tahmini · parantezde abonelik sayısı" icon="mdi-layers-outline">
            <MeterList v-if="m.mrr.byPlan.length" label="Plan başına aylık yinelenen gelir" :rows="planRows" />
            <p v-else class="bo-muted">Bu anda ücretli ve fiyatlı abonelik yok.</p>
          </EkCard>
          <EkCard title="Durum dağılımı" :subtitle="`Muaf olmayan abonelikler · muaf: ${formatCount(m.exemptSubscriptions)}`" icon="mdi-chart-bar">
            <MeterList label="Abonelik durumu dağılımı" :rows="statusRows" />
          </EkCard>
        </div>

        <div class="bo-grid-3">
          <EkMetricCard label="Deneme → ücretli dönüşüm" :value="formatPercent(m.trialConversion.rate)" :description="`${m.trialConversion.converted} / ${m.trialConversion.cohort} deneme (aralıkta açılan)`" icon="mdi-swap-horizontal" />
          <EkMetricCard label="Kayıp abonelik" :value="formatCount(m.churn.count)" :description="`Kayıp oranı ${formatPercent(m.churn.rate)} · kaybedilen MRR ${lostText}`" icon="mdi-account-minus-outline" tone="warning" />
          <EkMetricCard label="Ödeme olayları" :value="`${formatCount(m.paymentEvents.succeeded)} başarılı`" :description="`${formatCount(m.paymentEvents.failed)} başarısız`" icon="mdi-credit-card-check-outline" />
        </div>
        <p class="bo-muted bo-rev__note">
          <v-icon icon="mdi-information-outline" aria-hidden="true" />
          Kayıp yaklaşık: durum geçiş tarihçesi yok; aralıkta iptal/süresi dolmuş duruma son güncellenen abonelikler sayılır. Ödeme olayları tutar taşımaz.
        </p>
      </div>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { EkAlert, EkCard, EkMetricCard, EkRefreshButton } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { RevenueMetrics, RevenueRange, SubscriptionStatus } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import { SUB_STATUS, planLabel } from '@bo/utils/labels'
import { formatCount, formatMinor, formatPercent } from '@bo/utils/units'
import { formatDate } from '@bo/utils/format'
import '@bo/styles/kit.css'

const RANGES: RevenueRange[] = ['7d', '30d', '90d']
const range = ref<RevenueRange>('30d')
const res = useResource<RevenueMetrics>(() => api.call('BackofficeBillingService/getRevenueMetrics', { range: range.value }))
const m = computed(() => res.data.value)

function money(byCurrency: Record<string, number>) {
  const parts = Object.entries(byCurrency).map(([cur, minor]) => formatMinor(minor, cur))
  return parts.length ? parts.join(' + ') : formatMinor(0)
}
const mrrText = computed(() => (m.value ? money(m.value.mrr.byCurrency) : '—'))
const lostText = computed(() => (m.value ? money(m.value.churn.mrrLostByCurrency) : '—'))
const periodText = computed(() => (m.value ? `${formatDate(m.value.from)} – ${formatDate(m.value.to)}` : 'yükleniyor'))

const planRows = computed<MeterRow[]>(() =>
  (m.value?.mrr.byPlan ?? []).map((p) => ({
    key: p.planCode,
    label: `${planLabel(p.planCode)} (${p.subscriptions})`,
    value: p.mrrMinor,
    display: formatMinor(p.mrrMinor, p.currency),
    tone: 'info',
  })),
)
const statusRows = computed<MeterRow[]>(() =>
  (Object.keys(SUB_STATUS) as SubscriptionStatus[]).map((s) => ({
    key: s,
    label: SUB_STATUS[s].label,
    value: m.value?.statusDistribution[s] ?? 0,
    tone: SUB_STATUS[s].tone,
    dot: true,
  })),
)

watch(range, () => res.load())
onMounted(() => res.load())
</script>

<style scoped>
.bo-rev {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.bo-rev__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
</style>
