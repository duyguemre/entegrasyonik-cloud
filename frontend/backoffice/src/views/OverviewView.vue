<!--
  Genel bakış — triyaj panosu (BO-R1, K51; BO_UI_PATTERNS §11). Bilgi yığmaz; büyükten küçüğe:
  1 DİKKAT PANOSU (hüküm + sayaçlar → en büyük taş → sistem | müşteriler; ayrıntı yerinde açılır, çapaya göndermez)
  2 önemli metrikler · 3 büyük resim + genel kullanım · 4 teknik ayrıntılar (açık bölüm).
  Veri tek adaptörden (src/api/attention.ts): getAttention + getPulse; uç yoksa getHealth geri düşüşü.
-->
<template>
  <div class="bo-page bo-ov">
    <!-- Sayfa adına tıklamak yeniler (ayrı Yenile düğmesi yok; Alt+R aynı düğme). -->
    <BoPageHeader :updated-at="checkedAt" :stale="stale" :auto-refresh="30" refreshable :refreshing="loading" @refresh="load" />

    <!-- 1 · DİKKAT PANOSU: hüküm + sayaçlar → en büyük taş → sistem | müşteriler (ayrıntı yerinde açılır) -->
    <AttentionBoard :model="attention" :error="attentionError" :retrying="loading" :limit="narrow ? 2 : 3" @retry="load" />

    <!-- BO2-P1: önemli metrikler — tek bakışta sayı; ayrıntı kutunun bağlantısında / ipucunda. -->
    <MetricStrip :items="kpis" />

    <!-- 2 · büyük resim: her kutu neyi yanıtladığını başlıkta söyler -->
    <BoTileGrid :cols="2" class="bo-ov-row">
      <BoSection
        id="buyuk-resim"
        title="Platform trafiği · son 24 saat"
        description="Sistem ne kadar yük alıyor, sağlıklı yanıt veriyor mu? Karşılaştırma 7 günlük ortalamaya göre."
        icon="mdi-chart-timeline-variant"
        :status="bigStatus"
        :more="{ label: 'API sağlığı', to: { name: 'integrations' } }"
      >
        <BoPanelState v-if="pulseState !== 'ready'" :state="pulseState" :error="pulseError" :rows="5" empty-title="Trafik özeti henüz bağlı değil" empty-text="Sunucu bu özeti sağladığında trendler burada görünür. O zamana dek: Entegrasyonlar › API sağlığı." empty-icon="mdi-chart-line-variant" @retry="load" />
        <PulseTrends v-else-if="pulse" :model="pulse" />
      </BoSection>
      <BoSection
        id="kullanim"
        title="Müşteri tabanı ve abonelik"
        description="Kaç müşteri var, ne durumdalar, aboneliğe dönüşüyorlar mı?"
        icon="mdi-account-group-outline"
        :more="{ label: 'Gelir metrikleri', to: { name: 'subscriptions', query: { sekme: 'gelir' } } }"
      >
        <BoPanelState v-if="pulseState !== 'ready'" :state="pulseState" :error="pulseError" :rows="4" empty-title="Kullanım özeti henüz bağlı değil" empty-text="Abonelik ve gelir ayrıntısı: Abonelikler › gelir." empty-icon="mdi-account-group-outline" @retry="load" />
        <UsageSummary v-else-if="pulse" :model="pulse" @retry="load" />
      </BoSection>
    </BoTileGrid>

    <!-- AYRINTI — açık bölüm (katlanmaz): pano sadeleşince yer açıldı. -->
    <section id="teknik" class="bo-ov-tech" aria-labelledby="teknik-t">
      <header class="bo-ov-tech__head">
        <h2 id="teknik-t" class="bo-ov-tech__title">Teknik ayrıntılar</h2>
        <span class="bo-ov-tech__sub">Bağımlılıklar ve podlar · kuyruk sayaçları · veri alımı · son yönetim işlemleri</span>
      </header>
      <TechDetails :tick="tick" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoPanelState, { type PanelState } from '@bo/components/shell/BoPanelState.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import type { Health } from '@bo/components/triage/triage'
import { loadAttention, loadPulse, type AttentionModel, type PulseModel } from '@bo/api/attention'
import AttentionBoard from './overview/AttentionBoard.vue'
import MetricStrip, { type Metric } from './overview/MetricStrip.vue'
import PulseTrends from './overview/PulseTrends.vue'
import UsageSummary from './overview/UsageSummary.vue'
import TechDetails from './overview/TechDetails.vue'
import { formatMinor } from '@bo/utils/units'
import '@bo/styles/kit.css'

const REFRESH_MS = 30_000

const loading = ref(false)
const checkedAt = ref<number>()
const stale = ref(false)
const tick = ref(0)
const attention = ref<AttentionModel | null>(null)
const attentionError = ref<unknown>(null)
/** undefined = henüz yüklenmedi · null = uç yok (henüz bağlı değil). */
const pulse = ref<PulseModel | null | undefined>(undefined)
const pulseError = ref<unknown>(null)

async function load() {
  if (loading.value) return
  loading.value = true
  const [a, p] = await Promise.allSettled([loadAttention(), loadPulse()])
  // Yenileme başarısızsa son iyi görüntü korunur ve "bayat" işaretlenir; "Güncellendi" yalnız başarılı okumada ilerler.
  if (a.status === 'fulfilled') {
    attention.value = a.value
    attentionError.value = null
    checkedAt.value = Date.now()
    stale.value = false
  } else if (!attention.value) attentionError.value = a.reason
  else stale.value = true
  if (p.status === 'fulfilled') {
    pulse.value = p.value
    pulseError.value = null
  } else if (pulse.value === undefined) pulseError.value = p.reason
  tick.value++
  loading.value = false
}

// Mobilde (< 600 px) önce hüküm ve sayılar: listeler 2 maddeyle açılır (kritikler her zaman görünür).
const narrow = ref(false)
let mq: MediaQueryList | undefined
const onMq = () => (narrow.value = !!mq?.matches)

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  mq = window.matchMedia('(max-width: 600px)')
  onMq()
  mq.addEventListener('change', onMq)
  void load()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void load()
  }, REFRESH_MS)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  mq?.removeEventListener('change', onMq)
})

// ------------------------------------------------------------ önemli metrikler (BO2-P1)
const nf = new Intl.NumberFormat('tr-TR')
const kpis = computed<Metric[]>(() => {
  const row = (key: string) => pulse.value?.rows.find((r) => r.key === key)
  const http = row('http')
  const err = row('http5xx')
  const usage = pulse.value?.usage
  const tenants = usage?.tenants.state === 'ok' ? usage.tenants : null
  const mrr = usage?.mrr.state === 'ok' ? usage.mrr : null
  const pulseLoading = pulse.value === undefined && !pulseError.value
  return [
    {
      key: 'http',
      label: 'API isteği · 24 sa',
      value: http?.value ?? '—',
      loading: pulseLoading,
      hint: http?.note,
      delta: undefined,
      series: http?.series ?? undefined,
      info: '7 günlük ortalamaya göre değişim; çizgi son 24 saatin saatlik istek sayısı.',
    },
    {
      key: 'http5xx',
      label: '5xx hata oranı',
      value: err?.value ?? '—',
      loading: pulseLoading,
      tone: err?.over ? 'warning' : 'neutral',
      hint: err?.note,
      series: err?.series ?? undefined,
      info: '5xx yanıtların tüm isteklere oranı (son 24 saat). Eşik %5: aşılırsa uyarı.',
    },
    {
      key: 'tenants',
      label: 'Aktif müşteri',
      value: tenants ? nf.format(tenants.active) : '—',
      loading: pulseLoading,
      hint: tenants ? `Toplam ${nf.format(tenants.total)} müşteri` : undefined,
      to: { name: 'tenants' },
    },
    {
      key: 'mrr',
      label: 'MRR · aylık gelir',
      value: mrr ? formatMinor(mrr.minor, mrr.currency) : '—',
      loading: pulseLoading,
      hint: mrr ? `${nf.format(mrr.activeSubscriptions)} ücretli · ${nf.format(mrr.trialing)} denemede` : undefined,
      info: 'Plan liste fiyatından tahmini (MRR); muaf ve özel teklif hariç.',
      to: { name: 'subscriptions', query: { sekme: 'gelir' } },
    },
  ]
})

// ------------------------------------------------------------ nabız
const pulseState = computed<PanelState>(() => (pulse.value === undefined ? (pulseError.value ? 'error' : 'loading') : pulse.value === null ? 'empty' : 'ready'))
const big = computed<{ health: Health; answer: string }>(() => {
  const p = pulse.value
  if (!p) return { health: 'ok', answer: '' }
  const over = p.rows.filter((r) => r.over)
  if (over.length) return { health: 'warning', answer: over.length === 1 ? 'Bir gösterge eşik üstü' : `${over.length} gösterge eşik üstü` }
  return p.degraded.length ? { health: 'unknown', answer: 'Eksik veri' } : { health: 'ok', answer: 'Olağan' }
})
const bigStatus = computed(() => {
  if (!pulse.value) return undefined
  const tone = big.value.health === 'warning' ? 'warning' : big.value.health === 'critical' ? 'critical' : big.value.health === 'unknown' ? 'neutral' : 'ok'
  return { label: big.value.answer, tone } as const
})
</script>

<style scoped>
.bo-ov-tech {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.bo-ov-tech__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-3);
}

.bo-ov-tech__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.bo-ov-tech__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* BO2-12: satırlar BoTileGrid ile eş yükseklik (DOM/okuma sırası K51: 1-2-3-4). Bölümler kartla ayrık (BO2-11). */
.bo-ov-row > :deep(.bo-ts) {
  height: 100%;
}

/* ================= BO-LOCAL-01 — uygulamanın tasarım diliyle (DESIGN_SYSTEM §35) =================
   Kart dışı bölüm başlığı: eylem renginde kısa çizgi + BÜYÜK HARF mikro etiket (müşteri uygulamasının ana sayfasıyla aynı). */
.bo-ov-tech__head {
  align-items: center;
}

.bo-ov-tech__title {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-ov-tech__title::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}
</style>
