<template>
  <div class="bo-rev-stack">
    <BoSection id="bo-rev" title="Gelir metrikleri" :description="`Dönem: ${periodText}. Tutarlar plan liste fiyatından tahmindir.`" icon="mdi-chart-line">
      <template #actions>
        <BoSegmented v-model="range" :options="RANGE_OPTIONS" label="Aralık" />
        <EkRefreshButton quiet-success :loading="res.refreshing.value || res.phase.value === 'loading'" @refresh="res.load()" />
      </template>

      <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" degraded-title="Gelir metrikleri şu an okunamıyor" @retry="res.load()">
        <div v-if="m" class="bo-rev">
          <EkAlert tone="info" title="Liste fiyatından tahmini" text="Tutarlar plan liste fiyatına göre hesaplanır; indirim, kupon ve vergi hesaba katılmaz. Gerçek faturalanan tutar değildir." />

          <BoTileGrid :min="220" dense>
            <BoStat label="Aylık yinelenen gelir (MRR)" :value="mrrText" hint="liste fiyatından tahmini" info="MRR: aktif ve ödemesi gecikmiş, fiyatlı aboneliklerin aylık liste fiyatı toplamı." data-testid="mrr" />
            <BoStat label="Faturalanan abonelik" :value="formatCount(m.mrr.billedSubscriptions)" hint="aktif ve ödeme gecikmiş, fiyatlı" />
            <BoStat label="Teklif bazlı abonelik" :value="formatCount(m.mrr.quoteBasedSubscriptions)" hint="özel teklif; MRR'a girmez" />
          </BoTileGrid>
          <p v-if="m.mrr.unpricedSubscriptions" class="bo-muted bo-rev__note">
            {{ formatCount(m.mrr.unpricedSubscriptions) }} abonelik için plan kaydı bulunamadı (fiyatsız); MRR'a dahil edilmedi.
          </p>
        </div>
      </StateBlock>
    </BoSection>

    <template v-if="m">
      <BoTileGrid :cols="2">
        <BoSection title="Plan başına MRR" description="Liste fiyatından tahmini; parantezde abonelik sayısı." icon="mdi-layers-outline">
          <MeterList v-if="m.mrr.byPlan.length" label="Plan başına aylık yinelenen gelir" :rows="planRows" />
          <p v-else class="bo-muted">Bu anda ücretli ve fiyatlı abonelik yok.</p>
        </BoSection>
        <BoSection title="Durum dağılımı" :description="`Muaf olmayan abonelikler · muaf: ${formatCount(m.exemptSubscriptions)}`" icon="mdi-chart-donut">
          <div class="bo-rev__split">
            <BoChart
              v-if="statusTotal > 0"
              class="bo-rev__donut"
              kind="donut"
              :height="112"
              :categories="statusRows.map((r) => r.label)"
              :series="[{ name: 'Abonelik', data: statusRows.map((r) => r.value) }]"
              :category-tones="statusTones"
              :legend="false"
              :table="false"
              summary="Abonelik durum dağılımı"
            />
            <MeterList class="bo-rev__meter" label="Abonelik durumu dağılımı" :rows="statusRows" />
          </div>
        </BoSection>
      </BoTileGrid>

      <BoSection title="Dönüşüm, kayıp ve ödemeler" :description="`${periodText} aralığında deneme dönüşümü, kaybedilen abonelik ve ödeme olayları.`" icon="mdi-swap-horizontal">
        <BoTileGrid :min="220" dense>
          <BoStat label="Deneme → ücretli dönüşüm" :value="formatPercent(m.trialConversion.rate)" :hint="`${formatCount(m.trialConversion.converted)} / ${formatCount(m.trialConversion.cohort)} deneme`" info="Aralıkta açılan denemelerden ücretliye geçenlerin oranı." />
          <BoStat label="Kayıp abonelik" :value="formatCount(m.churn.count)" :hint="`Oran ${formatPercent(m.churn.rate)} · MRR ${lostText}`" tone="warning" />
          <BoStat label="Ödeme olayları" :value="`${formatCount(m.paymentEvents.succeeded)} başarılı`" :hint="`${formatCount(m.paymentEvents.failed)} başarısız`" />
        </BoTileGrid>
        <template #footer>
          <p class="bo-muted bo-rev__note">
            <v-icon icon="mdi-information-outline" aria-hidden="true" />
            Kayıp yaklaşık: durum geçiş tarihçesi yok; aralıkta iptal/süresi dolmuş duruma son güncellenen abonelikler sayılır. Ödeme olayları tutar taşımaz.
          </p>
        </template>
      </BoSection>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { EkAlert, EkRefreshButton } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { RevenueMetrics, RevenueRange, SubscriptionStatus } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
import BoChart from '@bo/components/charts/BoChart.vue'
import type { ChartTone } from '@bo/components/charts/chartTheme'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import { SUB_STATUS, planLabel } from '@bo/utils/labels'
import { formatCount, formatMinor, formatPercent } from '@bo/utils/units'
import { formatDate } from '@bo/utils/format'
import '@bo/styles/kit.css'

const RANGES: RevenueRange[] = ['7d', '30d', '90d']
const RANGE_OPTIONS = RANGES.map((r) => ({ value: r, label: r === '7d' ? '7 gün' : r === '30d' ? '30 gün' : '90 gün' }))
const range = ref<RevenueRange>('30d')
const res = useResource<RevenueMetrics>(() => api.call('BackofficeBillingService/getRevenueMetrics', { range: range.value }))
const m = computed(() => res.data.value)

function money(byCurrency: Record<string, number>) {
  const parts = Object.entries(byCurrency).map(([cur, minor]) => formatMinor(minor, cur))
  return parts.length ? parts.join(' + ') : formatMinor(0)
}
const mrrText = computed(() => (m.value ? money(m.value.mrr.byCurrency) : '—'))
const lostText = computed(() => (m.value ? money(m.value.churn.mrrLostByCurrency) : '—'))
const periodText = computed(() => (m.value ? `${formatDate(m.value.from)} – ${formatDate(m.value.to)}` : 'yükleniyor…'))

const planRows = computed<MeterRow[]>(() =>
  (m.value?.mrr.byPlan ?? []).map((p) => ({
    key: p.planCode,
    label: `${planLabel(p.planCode)} (${formatCount(p.subscriptions)})`,
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

const TONE: Record<string, ChartTone> = { success: 'success', danger: 'error', warning: 'warning', info: 'info', neutral: 'neutral' }
const statusTotal = computed(() => statusRows.value.reduce((a, r) => a + r.value, 0))
const statusTones = computed<ChartTone[]>(() => (Object.keys(SUB_STATUS) as SubscriptionStatus[]).map((k) => TONE[SUB_STATUS[k].tone] ?? 'neutral'))

watch(range, () => res.load())
onMounted(() => res.load())
</script>

<style scoped>
.bo-rev-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  min-width: 0;
}
.bo-rev {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.bo-rev__split {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
}
.bo-rev__donut { flex: 0 0 112px; width: 112px; }
.bo-rev__meter { flex: 1 1 auto; min-width: 0; }
.bo-rev__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-caption-size);
}

/* BO-LOCAL-01 — dipnot: ince çizgiyle ayrılan sakin satır. */
.bo-rev__note {
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}
</style>
